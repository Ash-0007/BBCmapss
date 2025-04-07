"""
Utility functions for freight simulation.
"""
import os
import math
import json
import numpy as np
import torch
import gymnasium as gym
from gymnasium import spaces
from collections import deque
import random
from .models import GaussianPolicy, QNetwork


class ReplayBuffer:
    """Experience replay buffer for SAC algorithm"""
    
    def __init__(self, capacity):
        self.capacity = capacity
        self.buffer = []
        self.position = 0
        
    def push(self, state, action, reward, next_state, done):
        if len(self.buffer) < self.capacity:
            self.buffer.append(None)
        self.buffer[self.position] = (state, action, reward, next_state, done)
        self.position = (self.position + 1) % self.capacity
        
    def sample(self, batch_size):
        batch = random.sample(self.buffer, batch_size)
        state, action, reward, next_state, done = map(np.stack, zip(*batch))
        return state, action, reward, next_state, done
        
    def __len__(self):
        return len(self.buffer)


class FreightRoutingEnv(gym.Env):
    """OpenAI Gym environment for freight routing optimization"""
    
    def __init__(self, simulation):
        super(FreightRoutingEnv, self).__init__()
        
        self.simulation = simulation
        self.graph = simulation.graph
        
        # Define action space
        # For each node, need to decide which edge to take
        self.max_edges_per_node = max(len(node.connections) for node in simulation.nodes.values())
        self.action_space = spaces.Box(
            low=-1.0,
            high=1.0,
            shape=(self.max_edges_per_node,),
            dtype=np.float32
        )
        
        # Define observation space
        # State includes current node features, available edges, weather, etc.
        # Using a flattened vector representation
        self.observation_space = spaces.Box(
            low=-np.inf,
            high=np.inf,
            shape=(50,),  # Fixed-size observation vector
            dtype=np.float32
        )
        
        self.current_node = None
        self.target_node = None
        self.visited_nodes = set()
        self.path = []
        self.done = False
        self.metrics = {'duration': 0, 'emissions': 0, 'cost': 0}
        
    def reset(self, source_id=None, target_id=None, seed=None):
        """Reset the environment with a new routing problem"""
        super().reset(seed=seed)
        
        # If source/target not provided, choose random nodes
        if source_id is None or source_id not in self.simulation.nodes:
            source_id = random.choice(list(self.simulation.nodes.keys()))
            
        if target_id is None or target_id not in self.simulation.nodes:
            # Choose a random target that's not the source
            candidates = [n for n in self.simulation.nodes.keys() if n != source_id]
            if candidates:
                target_id = random.choice(candidates)
            else:
                target_id = source_id  # Fallback
        
        self.current_node = source_id
        self.target_node = target_id
        self.visited_nodes = {source_id}
        self.path = [source_id]
        self.done = False
        self.metrics = {'duration': 0, 'emissions': 0, 'cost': 0}
        
        # Build observation
        observation = self._build_observation()
        
        return observation, {}
    
    def _build_observation(self):
        """Build the observation vector for the current state"""
        observation = np.zeros(self.observation_space.shape[0], dtype=np.float32)
        
        if self.current_node is None or self.current_node not in self.simulation.nodes:
            return observation
            
        # Current node features (normalized)
        current = self.simulation.nodes[self.current_node]
        
        # Handle potentially missing attributes with defaults
        current_lat = getattr(current, 'lat', 0)
        current_lon = getattr(current, 'lon', 0)
        current_delay = getattr(current, 'delay', 0)
        current_type = getattr(current, 'node_type', '') or getattr(current, 'type', '')
        
        observation[0] = (current_lat + 90) / 180  # Normalize lat to 0-1
        observation[1] = (current_lon + 180) / 360  # Normalize lon to 0-1
        observation[2] = current_delay / 24  # Normalize delay to 0-1
        observation[3] = 1.0 if current_type == 'airport' else 0.0
        observation[4] = 1.0 if current_type == 'seaport' else 0.0
        
        # Target node features
        if self.target_node in self.simulation.nodes:
            target = self.simulation.nodes[self.target_node]
            target_lat = getattr(target, 'lat', 0)
            target_lon = getattr(target, 'lon', 0)
            
            observation[5] = (target_lat + 90) / 180
            observation[6] = (target_lon + 180) / 360
            
            # Direction and distance to target
            dx = target_lon - current_lon
            dy = target_lat - current_lat
            distance = math.sqrt(dx**2 + dy**2)
            angle = math.atan2(dy, dx) / math.pi  # Normalize to -1 to 1
            
            observation[7] = distance / 360  # Normalize distance
            observation[8] = angle
        
        # Available connections features
        # Get connections safely
        if hasattr(current, 'connections'):
            connections = current.connections
        else:
            # Find all edges starting from this node
            connections = []
            for edge in self.simulation.edges:
                if edge.source == self.current_node:
                    connections.append(edge)
                    
        for i, edge in enumerate(connections[:min(len(connections), 10)]):  # Limit to 10 connections
            if edge.destination in self.visited_nodes:
                continue  # Skip already visited nodes
                
            idx = 10 + i * 4  # Each edge uses 4 positions
            
            # Get edge attributes safely
            edge_mode = getattr(edge, 'mode', 'ship')
            
            # Get current or regular attributes depending on what's available
            edge_duration = getattr(edge, 'current_duration', None) or getattr(edge, 'duration', 0)
            edge_emissions = getattr(edge, 'current_emissions', None) or getattr(edge, 'emissions', 0)
            edge_cost = getattr(edge, 'current_cost', None) or getattr(edge, 'cost', 0)
            
            # Normalize edge attributes
            observation[idx] = 1.0 if edge_mode == 'flight' else 0.0
            observation[idx+1] = edge_duration / 100  # Normalize duration
            observation[idx+2] = edge_emissions / 1000  # Normalize emissions
            observation[idx+3] = edge_cost / 5000  # Normalize cost
        
        return observation
    
    def step(self, action):
        """Take an action in the environment"""
        reward = 0
        info = {}
        
        if self.done:
            observation = self._build_observation()
            return observation, reward, self.done, False, info
            
        # Convert action to edge selection
        current_node = self.simulation.nodes.get(self.current_node)
        if not current_node:
            # Node not found, end episode
            self.done = True
            reward = -10
            observation = self._build_observation()
            return observation, reward, self.done, False, info
        
        # Get connections, handling potential missing attributes
        if hasattr(current_node, 'connections'):
            connections = current_node.connections
        else:
            # Find all edges starting from this node
            connections = []
            for edge in self.simulation.edges:
                if edge.source == self.current_node:
                    connections.append(edge)
        
        valid_connections = [c for c in connections if c.destination not in self.visited_nodes]
        
        if not valid_connections:
            # No valid connections, mark as done with negative reward
            self.done = True
            reward = -10
            observation = self._build_observation()
            return observation, reward, self.done, False, info
            
        # Use action to select edge
        action_idx = int((action[0] + 1) * len(valid_connections) / 2) % len(valid_connections)
        selected_edge = valid_connections[action_idx]
        
        # Apply the selected edge
        self.current_node = selected_edge.destination
        self.visited_nodes.add(self.current_node)
        self.path.append(self.current_node)
        
        # Update metrics
        self.metrics['duration'] += selected_edge.current_duration if hasattr(selected_edge, 'current_duration') else selected_edge.duration
        self.metrics['emissions'] += selected_edge.current_emissions if hasattr(selected_edge, 'current_emissions') else selected_edge.emissions
        self.metrics['cost'] += selected_edge.current_cost if hasattr(selected_edge, 'current_cost') else selected_edge.cost
        
        # Check if we've reached the target
        if self.current_node == self.target_node:
            self.done = True
            
            # Normalize metrics for reward calculation
            norm_duration = self.metrics['duration'] / 100
            norm_emissions = self.metrics['emissions'] / 1000
            norm_cost = self.metrics['cost'] / 5000
            
            # Calculate weighted score (lower is better)
            weighted_score = (
                self.simulation.weights['duration'] * norm_duration + 
                self.simulation.weights['emissions'] * norm_emissions + 
                self.simulation.weights['cost'] * norm_cost
            )
            
            # Convert to reward (higher is better)
            base_reward = 10
            penalty = weighted_score * 5
            reward = base_reward - penalty
            
            # Additional reward for shorter paths
            if len(self.path) < 10:
                reward += (10 - len(self.path))
        else:
            # Small penalty for each step to encourage shorter paths
            reward = -0.1
            
            # Add distance-based guidance reward
            target_node = self.simulation.nodes.get(self.target_node)
            current_node = self.simulation.nodes.get(self.current_node)
            
            if target_node and current_node:
                dx = target_node.lon - current_node.lon
                dy = target_node.lat - current_node.lat
                distance = math.sqrt(dx**2 + dy**2)
                
                # Smaller distance = better reward
                distance_reward = 0.1 * (1 - min(1, distance / 180))
                reward += distance_reward
        
        # Build observation for the new state
        observation = self._build_observation()
        
        # Add path info
        info = {
            'path': self.path,
            'metrics': self.metrics
        }
        
        return observation, reward, self.done, False, info


class SACAgent:
    """Soft Actor-Critic agent for route optimization"""
    
    def __init__(self, observation_space, action_space, hidden_size=256, lr=0.0003,
                 gamma=0.99, tau=0.005, alpha=0.2, batch_size=256, device='cpu'):
        self.gamma = gamma
        self.tau = tau
        self.alpha = alpha
        self.batch_size = batch_size
        self.device = device
        
        # Policy network
        self.policy = GaussianPolicy(
            observation_space.shape[0],
            action_space.shape[0],
            hidden_size,
            action_space=action_space
        ).to(device)
        
        # Q-function networks
        self.q1 = QNetwork(
            observation_space.shape[0],
            action_space.shape[0],
            hidden_size
        ).to(device)
        
        self.q2 = QNetwork(
            observation_space.shape[0],
            action_space.shape[0],
            hidden_size
        ).to(device)
        
        # Target networks
        self.target_q1 = QNetwork(
            observation_space.shape[0],
            action_space.shape[0],
            hidden_size
        ).to(device)
        
        self.target_q2 = QNetwork(
            observation_space.shape[0],
            action_space.shape[0],
            hidden_size
        ).to(device)
        
        # Copy parameters
        for target_param, param in zip(self.target_q1.parameters(), self.q1.parameters()):
            target_param.data.copy_(param.data)
            
        for target_param, param in zip(self.target_q2.parameters(), self.q2.parameters()):
            target_param.data.copy_(param.data)
            
        # Optimizers
        self.policy_optimizer = torch.optim.Adam(self.policy.parameters(), lr=lr)
        self.q1_optimizer = torch.optim.Adam(self.q1.parameters(), lr=lr)
        self.q2_optimizer = torch.optim.Adam(self.q2.parameters(), lr=lr)
        
        # Experience replay buffer
        self.replay_buffer = ReplayBuffer(1000000)
        
    def select_action(self, state, evaluate=False):
        state = torch.FloatTensor(state).unsqueeze(0).to(self.device)
        
        if evaluate:
            _, _, action = self.policy.sample(state)
        else:
            action, _, _ = self.policy.sample(state)
            
        return action.detach().cpu().numpy()[0]
        
    def update_parameters(self):
        if len(self.replay_buffer) < self.batch_size:
            return
            
        # Sample a batch from memory
        state_batch, action_batch, reward_batch, next_state_batch, done_batch = \
            self.replay_buffer.sample(self.batch_size)
            
        state_batch = torch.FloatTensor(state_batch).to(self.device)
        action_batch = torch.FloatTensor(action_batch).to(self.device)
        reward_batch = torch.FloatTensor(reward_batch).unsqueeze(1).to(self.device)
        next_state_batch = torch.FloatTensor(next_state_batch).to(self.device)
        done_batch = torch.FloatTensor(done_batch).unsqueeze(1).to(self.device)
        
        with torch.no_grad():
            next_action, next_log_prob, _ = self.policy.sample(next_state_batch)
            
            target_q1 = self.target_q1(next_state_batch, next_action)
            target_q2 = self.target_q2(next_state_batch, next_action)
            target_q = torch.min(target_q1, target_q2) - self.alpha * next_log_prob
            target_q = reward_batch + (1 - done_batch) * self.gamma * target_q
            
        # Update Q-functions
        q1 = self.q1(state_batch, action_batch)
        q2 = self.q2(state_batch, action_batch)
        
        q1_loss = torch.nn.functional.mse_loss(q1, target_q)
        q2_loss = torch.nn.functional.mse_loss(q2, target_q)
        
        self.q1_optimizer.zero_grad()
        q1_loss.backward()
        self.q1_optimizer.step()
        
        self.q2_optimizer.zero_grad()
        q2_loss.backward()
        self.q2_optimizer.step()
        
        # Update policy
        new_actions, log_prob, _ = self.policy.sample(state_batch)
        
        q1_new = self.q1(state_batch, new_actions)
        q2_new = self.q2(state_batch, new_actions)
        q_new = torch.min(q1_new, q2_new)
        
        policy_loss = (self.alpha * log_prob - q_new).mean()
        
        self.policy_optimizer.zero_grad()
        policy_loss.backward()
        self.policy_optimizer.step()
        
        # Update target networks
        for target_param, param in zip(self.target_q1.parameters(), self.q1.parameters()):
            target_param.data.copy_(target_param.data * (1.0 - self.tau) + param.data * self.tau)
            
        for target_param, param in zip(self.target_q2.parameters(), self.q2.parameters()):
            target_param.data.copy_(target_param.data * (1.0 - self.tau) + param.data * self.tau)
            
    def save(self, directory):
        """Save model parameters"""
        if not os.path.exists(directory):
            os.makedirs(directory)
            
        torch.save(self.policy.state_dict(), os.path.join(directory, 'policy.pth'))
        torch.save(self.q1.state_dict(), os.path.join(directory, 'q1.pth'))
        torch.save(self.q2.state_dict(), os.path.join(directory, 'q2.pth'))
        
    def load(self, directory):
        """Load model parameters"""
        self.policy.load_state_dict(
            torch.load(os.path.join(directory, 'policy.pth'), map_location=self.device)
        )
        self.q1.load_state_dict(
            torch.load(os.path.join(directory, 'q1.pth'), map_location=self.device)
        )
        self.q2.load_state_dict(
            torch.load(os.path.join(directory, 'q2.pth'), map_location=self.device)
        )
        
        for target_param, param in zip(self.target_q1.parameters(), self.q1.parameters()):
            target_param.data.copy_(param.data)
            
        for target_param, param in zip(self.target_q2.parameters(), self.q2.parameters()):
            target_param.data.copy_(param.data)

    def find_path(self, graph, source_id, target_id, weights=None):
        """Find a path from source to target using the trained policy

        Args:
            graph: The simulation graph
            source_id: Starting node ID
            target_id: Target node ID
            weights: Optimization weights (dict with duration, emissions, cost)

        Returns:
            Tuple of (path, metrics) where:
            - path is a list of node IDs from source to target
            - metrics is a dict with duration, emissions, cost values
        """
        # Create an environment instance for simulation
        from .simulation import FreightSimulation
        sim = FreightSimulation()
        
        # For a proper NetworkX graph, we need to use graph's node data structure directly
        sim.nodes = {}
        for node_id, node_data in graph.nodes.items():
            # If graph.nodes is a dict of Node objects, use directly
            if hasattr(node_data, 'connections'):
                sim.nodes[node_id] = node_data
            # If graph.nodes is a dict of dicts, create Node objects
            else:
                from .models import Node
                # Convert dict to Node object
                node = Node(
                    id=node_id,
                    lat=node_data.get('lat', 0),
                    lon=node_data.get('lon', 0),
                    name=node_data.get('name', f'Node {node_id}'),
                    node_type=node_data.get('type', 'unknown')
                )
                sim.nodes[node_id] = node
        
        # Set edges
        sim.edges = graph.edges if hasattr(graph, 'edges') else []
        sim.graph = graph
        
        # Update weights if provided
        if weights:
            sim.weights = weights
            
        env = FreightRoutingEnv(sim)
        
        # Reset the environment with source and target
        state, _ = env.reset(source_id=source_id, target_id=target_id)
        
        done = False
        path = [source_id]
        
        # Follow the policy until done
        max_steps = 20  # Prevent infinite loops
        step_count = 0
        
        while not done and step_count < max_steps:
            action = self.select_action(state, evaluate=True)
            next_state, reward, done, _, info = env.step(action)
            
            state = next_state
            if 'path' in info:
                path = info['path']
                
            step_count += 1
        
        # If we didn't reach the target, return None
        if not done or path[-1] != target_id:
            return None, None
            
        # Return the path and metrics
        return path, env.metrics
