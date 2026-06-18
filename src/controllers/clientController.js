const { Cliente } = require('../models');

exports.getAllClients = async (req, res) => {
    try {
        const clients = await Cliente.findAll();
        return res.status(200).json({ success: true, data: clients });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

exports.createClient = async (req, res) => {
    try {
        const { dni, nombre, apellido, celular, direccion, ocupacion, genero, estado_civil, ingreso_mensual, moneda_ingresos, edad } = req.body;
        const newClient = await Cliente.create({ dni, nombre, apellido, celular, direccion, ocupacion, genero, estado_civil, ingreso_mensual, moneda_ingresos, edad });
        return res.status(201).json({ success: true, data: newClient });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

exports.updateClient = async (req, res) => {
    try {
        const { id } = req.params;
        const { dni, nombre, apellido, celular, direccion, ocupacion, genero, estado_civil, ingreso_mensual, moneda_ingresos, edad } = req.body;
        const client = await Cliente.findByPk(id);
        if (!client) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
        
        await client.update({ dni, nombre, apellido, celular, direccion, ocupacion, genero, estado_civil, ingreso_mensual, moneda_ingresos, edad });
        return res.status(200).json({ success: true, data: client });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

exports.deleteClient = async (req, res) => {
    try {
        const { id } = req.params;
        const client = await Cliente.findByPk(id);
        if (!client) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
        
        await client.destroy();
        return res.status(200).json({ success: true, message: 'Cliente eliminado' });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};
