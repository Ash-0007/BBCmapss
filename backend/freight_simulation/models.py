"""
Data models for the freight simulation application.
"""
import json
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.distributions import Normal

# Graph Node and Edge models
class Node:
    def __init__(self, id, lat, lon, name, node_type, country=None, connections_count=0):
        """
        Represents a node in the transportation network (airport, seaport, etc.)
        """
        self.id = id              # Unique identifier
        self.lat = float(lat)     # Latitude
        self.lon = float(lon)     # Longitude
        self.name = name          # Node name
        self.type = node_type     # 'airport', 'seaport', etc.
        self.country = country    # Country location
        self.delay = 0            # Current delay in hours
        self.blocked = False      # Whether node is completely blocked
        self.connections = []     # List of connected edges
        self.connections_count = connections_count  # Number of connections (for quick reference)
        
    def to_dict(self):
        return {
            'id': self.id,
            'lat': self.lat,
            'lon': self.lon,
            'name': self.name,
            'type': self.type,
            'country': self.country,
            'delay': self.delay,
            'blocked': self.blocked,
            'connections': self.connections_count  # Include connection count in API response
        }
        
    def __repr__(self):
        return f"{self.type.capitalize()} {self.id}: {self.name} ({self.lat}, {self.lon})"


class Edge:
    def __init__(self, source, destination, mode, duration, emissions, cost):
        """
        Represents an edge in the transportation network
        """
        self.source = source          # Source node ID
        self.destination = destination # Destination node ID
        self.mode = mode              # 'flight', 'ship', 'truck'
        self.base_duration = float(duration)  # Base duration in hours
        self.base_emissions = float(emissions) # Base emissions in tons CO2
        self.base_cost = float(cost)  # Base cost in USD
        
        # Current values affected by weather, etc.
        self.current_duration = self.base_duration
        self.current_emissions = self.base_emissions
        self.current_cost = self.base_cost
        
        # Weather impact factor (0-1)
        self.weather_impact = 0
        
    def to_dict(self):
        return {
            'source': self.source,
            'destination': self.destination,
            'mode': self.mode,
            'duration': self.current_duration,
            'emissions': self.current_emissions,
            'cost': self.current_cost,
            'weather_impact': self.weather_impact
        }
        
    def update_values(self, weather_impact=None):
        """Update edge values based on weather impact"""
        if weather_impact is not None:
            self.weather_impact = weather_impact
            
        # Weather increases duration and emissions
        weather_factor = 1.0 + (self.weather_impact * 2.0)  # Max 3x increase at severity 1
        self.current_duration = self.base_duration * weather_factor
        self.current_emissions = self.base_emissions * weather_factor
        
        # Weather can also increase cost due to rerouting, extra fuel, etc.
        cost_factor = 1.0 + (self.weather_impact * 1.5)  # Max 2.5x increase at severity 1
        self.current_cost = self.base_cost * cost_factor
        
    def __repr__(self):
        return f"Edge {self.source}->{self.destination} ({self.mode}): {self.current_duration}h, {self.current_emissions}t CO2, ${self.current_cost}"


# Weather and Pain Point models
class WeatherGrid:
    def __init__(self, grid_size=5):
        """
        Represents a global grid of weather severity
        Uses 5-degree lat/lon blocks by default
        """
        self.grid_size = grid_size
        # Initialize empty grid with 0 severity
        self.grid = {}  # Format: (lat_block, lon_block) -> severity [0-1]
        
    def get_block_key(self, lat, lon):
        """Convert lat/lon to grid block key"""
        lat_block = int(lat / self.grid_size) * self.grid_size
        lon_block = int(lon / self.grid_size) * self.grid_size
        return (lat_block, lon_block)
    
    def set_severity(self, lat, lon, severity):
        """Set weather severity for a specific block"""
        if severity < 0 or severity > 1:
            raise ValueError("Severity must be between 0 and 1")
        key = self.get_block_key(lat, lon)
        self.grid[key] = float(severity)
        
    def get_severity(self, lat, lon):
        """Get weather severity for a specific location"""
        key = self.get_block_key(lat, lon)
        return self.grid.get(key, 0.0)
    
    def to_dict(self):
        """Convert to dictionary for JSON serialization"""
        return {
            'grid_size': self.grid_size,
            'grid': {f"{k[0]},{k[1]}": v for k, v in self.grid.items()}
        }
    
    @classmethod
    def from_dict(cls, data):
        """Create from dictionary"""
        grid = cls(grid_size=data.get('grid_size', 5))
        for key_str, value in data.get('grid', {}).items():
            lat, lon = map(float, key_str.split(','))
            grid.grid[(lat, lon)] = value
        return grid


class PainPoint:
    def __init__(self, node_id, event_type, name, delay_increase=0, blocked=False):
        """
        Represents a disruption event at a specific node
        """
        self.node_id = node_id
        self.event_type = event_type  # 'strike', 'natural_disaster', 'congestion', etc.
        self.name = name
        self.delay_increase = delay_increase  # Additional hours of delay
        self.blocked = blocked  # Whether node is completely blocked
        
    def to_dict(self):
        return {
            'node_id': self.node_id,
            'event_type': self.event_type,
            'name': self.name,
            'delay_increase': self.delay_increase,
            'blocked': self.blocked
        }


# SAC Actor-Critic model components
class GaussianPolicy(nn.Module):
    def __init__(self, num_inputs, num_actions, hidden_size, num_layers=2, action_space=None):
        super(GaussianPolicy, self).__init__()
        
        # Build the network layers
        layers = [nn.Linear(num_inputs, hidden_size), nn.ReLU()]
        for _ in range(num_layers - 1):
            layers.append(nn.Linear(hidden_size, hidden_size))
            layers.append(nn.ReLU())
            
        self.network = nn.Sequential(*layers)
        
        # Output layers
        self.mean_layer = nn.Linear(hidden_size, num_actions)
        self.log_std_layer = nn.Linear(hidden_size, num_actions)
        
        # Action rescaling
        if action_space is None:
            self.action_scale = torch.tensor(1.)
            self.action_bias = torch.tensor(0.)
        else:
            self.action_scale = torch.tensor((action_space.high - action_space.low) / 2.)
            self.action_bias = torch.tensor((action_space.high + action_space.low) / 2.)
            
    def forward(self, state):
        x = self.network(state)
        
        mean = self.mean_layer(x)
        log_std = self.log_std_layer(x)
        log_std = torch.clamp(log_std, min=-20, max=2)
        
        return mean, log_std
    
    def sample(self, state):
        mean, log_std = self.forward(state)
        std = log_std.exp()
        
        normal = Normal(mean, std)
        x_t = normal.rsample()  # reparameterization trick
        y_t = torch.tanh(x_t)
        
        action = y_t * self.action_scale + self.action_bias
        log_prob = normal.log_prob(x_t)
        
        # Apply correction for tanh squashing
        log_prob -= torch.log(self.action_scale * (1 - y_t.pow(2)) + 1e-6)
        log_prob = log_prob.sum(1, keepdim=True)
        
        mean = torch.tanh(mean) * self.action_scale + self.action_bias
        
        return action, log_prob, mean


class QNetwork(nn.Module):
    def __init__(self, num_inputs, num_actions, hidden_size, num_layers=2):
        super(QNetwork, self).__init__()
        
        # Build the network layers
        layers = [nn.Linear(num_inputs + num_actions, hidden_size), nn.ReLU()]
        for _ in range(num_layers - 1):
            layers.append(nn.Linear(hidden_size, hidden_size))
            layers.append(nn.ReLU())
            
        # Output Q-value
        layers.append(nn.Linear(hidden_size, 1))
        
        self.q_network = nn.Sequential(*layers)
        
    def forward(self, state, action):
        x = torch.cat([state, action], 1)
        return self.q_network(x)
