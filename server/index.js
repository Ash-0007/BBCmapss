const express = require('express');
const cors = require('cors');
const vesselRoutes = require('./routes/vesselRoutes');

const app = express();


app.use(cors());
app.use(express.json());


app.use('/api', vesselRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 