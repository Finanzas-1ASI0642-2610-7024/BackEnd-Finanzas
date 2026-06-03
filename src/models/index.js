const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Usuario = sequelize.define('Usuario', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nombre: { type: DataTypes.STRING, allowNull: false },
    contrasena: { type: DataTypes.STRING, allowNull: false }
}, { tableName: 'usuarios', timestamps: false });

const Cliente = sequelize.define('Cliente', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nombre: { type: DataTypes.STRING, allowNull: false },
    dni: { type: DataTypes.STRING(8), allowNull: false, unique: true },
    ingreso_mensual: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    edad: { type: DataTypes.INTEGER, allowNull: false }
}, { tableName: 'clientes', timestamps: false });

const Vehiculo = sequelize.define('Vehiculo', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    marca: { type: DataTypes.STRING, allowNull: false },
    modelo: { type: DataTypes.STRING, allowNull: false },
    anio: { type: DataTypes.INTEGER, allowNull: false },
    precio: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    imagen: { type: DataTypes.STRING, allowNull: true }
}, { tableName: 'vehiculos', timestamps: false });

const CostosAdicionales = sequelize.define('CostosAdicionales', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    seguro_desgravamen: { type: DataTypes.DECIMAL(5, 4), allowNull: false },
    seguro_vehicular: { type: DataTypes.DECIMAL(5, 4), allowNull: false },
    comisiones: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 }
}, { tableName: 'costos_adicionales', timestamps: false });

const CreditoVehicular = sequelize.define('CreditoVehicular', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    cuota_inicial: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    monto_financiado: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    tipo_moneda: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'PEN' },
    tipo_tasa: { type: DataTypes.STRING(10), allowNull: false },
    tasa_interes: { type: DataTypes.DECIMAL(8, 6), allowNull: false },
    capitalizacion: { type: DataTypes.STRING(15), allowNull: true },
    plazo_meses: { type: DataTypes.INTEGER, allowNull: false },
    tipo_gracia: { type: DataTypes.STRING(10), allowNull: true },
    periodos_gracia: { type: DataTypes.INTEGER, defaultValue: 0 }
}, { tableName: 'creditos_vehiculares', timestamps: true });

const DatosSalida = sequelize.define('DatosSalida', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    monto_financiado: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    cuota_mensual: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    cuota_final: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    TCEA: { type: DataTypes.DECIMAL(8, 6), allowNull: false },
    VAN: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    TIR: { type: DataTypes.DECIMAL(8, 6), allowNull: false },
    cronograma_pagos_json: { type: DataTypes.TEXT, allowNull: false } // En SQLite es TEXT para JSON
}, { tableName: 'datos_salida', timestamps: true });

// Relaciones
Cliente.belongsTo(Usuario, { foreignKey: 'ID_Usuario' });
CreditoVehicular.belongsTo(Cliente, { foreignKey: 'ID_Cliente' });
CreditoVehicular.belongsTo(Vehiculo, { foreignKey: 'ID_Vehiculo' });
CreditoVehicular.belongsTo(CostosAdicionales, { foreignKey: 'ID_Adicionales' });
DatosSalida.belongsTo(CreditoVehicular, { foreignKey: 'ID_Credito' });

module.exports = {
    sequelize, Usuario, Cliente, Vehiculo, CostosAdicionales, CreditoVehicular, DatosSalida
};
