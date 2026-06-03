const express = require('express');
const cors = require('cors');
const sequelize = require('./src/config/database');
const creditRoutes = require('./src/routes/creditRoutes');
const models = require('./src/models'); // Forzar la carga de modelos

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/credit', creditRoutes);

const PORT = process.env.PORT || 3000;

sequelize.sync({ force: false }).then(() => {
    console.log('Database synced');
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}).catch(err => {
    console.error('Error syncing db:', err);
});
