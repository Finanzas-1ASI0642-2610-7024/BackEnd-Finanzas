const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Usuario = sequelize.define('Usuario', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nombre: { type: DataTypes.STRING, allowNull: false, unique: true }, // usar nombre como username
    contrasena: { type: DataTypes.STRING, allowNull: false },
    rol: { type: DataTypes.STRING, allowNull: false, defaultValue: 'user' } // 'admin' o 'user'
}, { tableName: 'usuarios', timestamps: false });

const Cliente = sequelize.define('Cliente', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nombre: { type: DataTypes.STRING, allowNull: false },
    apellido: { type: DataTypes.STRING, allowNull: false },
    dni: { type: DataTypes.STRING(8), allowNull: false, unique: true },
    direccion: { type: DataTypes.STRING, allowNull: true },
    ocupacion: { type: DataTypes.STRING, allowNull: true },
    genero: { type: DataTypes.STRING, allowNull: true },
    celular: { type: DataTypes.STRING, allowNull: true },
    estado_civil: { type: DataTypes.STRING, allowNull: true },
    ingreso_mensual: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    moneda_ingresos: { type: DataTypes.STRING, allowNull: false, defaultValue: 'PEN' },
    edad: { type: DataTypes.INTEGER, allowNull: false }
}, { tableName: 'clientes', timestamps: false });

const Vehiculo = sequelize.define('Vehiculo', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    marca: { type: DataTypes.STRING, allowNull: false },
    modelo: { type: DataTypes.STRING, allowNull: false },
    anio: { type: DataTypes.INTEGER, allowNull: false },
    precio: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    estado: { type: DataTypes.STRING, allowNull: false, defaultValue: 'Nuevo' },
    numero_serie: { type: DataTypes.STRING, allowNull: false, unique: true },
    kilometraje: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    moneda: { type: DataTypes.STRING, allowNull: false, defaultValue: 'PEN' },
    imagen: { type: DataTypes.TEXT, allowNull: true } // TEXT for base64 strings
}, { tableName: 'vehiculos', timestamps: false });

const CostosAdicionales = sequelize.define('CostosAdicionales', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    seguro_desgravamen: { type: DataTypes.DECIMAL(5, 4), allowNull: false },
    seguro_vehicular: { type: DataTypes.DECIMAL(5, 4), allowNull: false },
    comisiones: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 },
    costos_notariales: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 },
    costos_registrales: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 }
}, { tableName: 'costos_adicionales', timestamps: false });

const CreditoVehicular = sequelize.define('CreditoVehicular', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    estado: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'Simulacion' }, // 'Simulacion' o 'Otorgado'
    cuota_inicial: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    cuota_final_porcentaje: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 30 },
    monto_financiado: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    tipo_moneda: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'PEN' },
    tipo_tasa: { type: DataTypes.STRING(10), allowNull: false },
    tasa_interes: { type: DataTypes.DECIMAL(8, 6), allowNull: false },
    capitalizacion: { type: DataTypes.STRING(15), allowNull: true },
    tasa_descuento_COK: { type: DataTypes.DECIMAL(5, 4), allowNull: false },
    estado: { type: DataTypes.STRING, defaultValue: 'Simulado' },
    tipo_moneda: { type: DataTypes.STRING, allowNull: false, defaultValue: 'PEN' },
    tipo_cambio: { type: DataTypes.DECIMAL(10, 4), allowNull: false, defaultValue: 1.0000 },
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
CreditoVehicular.belongsTo(Usuario, { foreignKey: 'ID_Usuario_Creador' });
Usuario.hasMany(CreditoVehicular, { foreignKey: 'ID_Usuario_Creador' });

CreditoVehicular.belongsTo(Cliente, { foreignKey: 'ID_Cliente' });
Cliente.hasMany(CreditoVehicular, { foreignKey: 'ID_Cliente' });

CreditoVehicular.belongsTo(Vehiculo, { foreignKey: 'ID_Vehiculo' });
Vehiculo.hasOne(CreditoVehicular, { foreignKey: 'ID_Vehiculo' });

CreditoVehicular.belongsTo(CostosAdicionales, { foreignKey: 'ID_Adicionales' });
CostosAdicionales.hasOne(CreditoVehicular, { foreignKey: 'ID_Adicionales' });

DatosSalida.belongsTo(CreditoVehicular, { foreignKey: 'ID_Credito', onDelete: 'CASCADE' });
CreditoVehicular.hasOne(DatosSalida, { foreignKey: 'ID_Credito' });

module.exports = {
    sequelize, Usuario, Cliente, Vehiculo, CostosAdicionales, CreditoVehicular, DatosSalida
};
