const { Sequelize } = require('sequelize');
require('dotenv').config();

// Usando SQLite para facilidad de integración local como acordamos
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './autotech_database.sqlite',
    logging: false // Desactivar logs de SQL en consola
});

module.exports = sequelize;
