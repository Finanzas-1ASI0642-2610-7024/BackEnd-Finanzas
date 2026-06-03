const express = require('express');
const cors = require('cors');
const sequelize = require('./src/config/database');
const creditRoutes = require('./src/routes/creditRoutes');
const userRoutes = require('./src/routes/userRoutes');
const { Usuario } = require('./src/models'); 

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/credit', creditRoutes);
app.use('/api/users', userRoutes);
app.use('/api/auth', userRoutes);

const PORT = process.env.PORT || 3000;

sequelize.sync({ alter: true }).then(async () => {
    console.log('Database synced');
    
    // Seed default users
    const adminExists = await Usuario.findOne({ where: { nombre: 'admin' } });
    if (!adminExists) {
        await Usuario.create({ nombre: 'admin', contrasena: 'finanzas', rol: 'admin' });
        console.log('Usuario admin creado');
    }
    const userExists = await Usuario.findOne({ where: { nombre: 'user' } });
    if (!userExists) {
        await Usuario.create({ nombre: 'user', contrasena: 'user', rol: 'user' });
        console.log('Usuario standard creado');
    }

    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}).catch(err => {
    console.error('Error syncing db:', err);
});
