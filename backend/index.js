const express = require('express');
const cors = require('cors');
const path = require('path');
const logger = require('./utils/logger');
const dataLoader = require('./utils/dataLoader');
const voyageCache = require('./utils/voyageCache');
const vesselRoutes = require('./routes/vesselRoutes');
const airCargoRoutes = require('./routes/airCargoRoutes');
const mscRouteRoutes = require('./routes/mscRouteRoutes');
const hapagLloydRoutes = require('./routes/hapagLloydRoutes');
const multimodalRoutes = require('./routes/multimodalRoutes');
const routesDataStoreRoutes = require('./routes/routesDataStoreRoutes');
const emissionsRoutes = require('./routes/emissionsRoutes');
const calculatorEndpoints = require('./routes/calculatorEndpoints');
const CathayCargo = require('./CathayCargoApiExtractor');

// Import database connection
const { pool } = require('./config/db');

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Global token for APIs that need it
global.Token = "";

// Set up middleware
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:5174'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add database connection middleware
app.use((req, res, next) => {
    // Attach the database pool to the request object
    req.db = pool;
    next();
});

// Initialize data and caches
dataLoader.loadProcessedData();
voyageCache.loadFromFile();

// Set up routes
app.use('/api', vesselRoutes);
app.use('/api', airCargoRoutes);
app.use('/api', mscRouteRoutes);
app.use('/api', hapagLloydRoutes);
app.use('/api', multimodalRoutes);
app.use('/api/routes-data', routesDataStoreRoutes);
app.use('/api', emissionsRoutes);
app.use('/api/calculator', calculatorEndpoints);

// Add error handler middleware
app.use((err, req, res, next) => {
    logger.error('Server', `Error: ${err.message}`);
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Start server
app.listen(port, () => {
    logger.info('Server', `Server is running on port ${port}`);
    console.log(`Server is running on port ${port}`);
}); 