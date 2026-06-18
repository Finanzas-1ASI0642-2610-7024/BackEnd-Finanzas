const { Vehiculo } = require('../models');

exports.getAllVehicles = async (req, res) => {
    try {
        const vehicles = await Vehiculo.findAll();
        return res.status(200).json({ success: true, data: vehicles });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

exports.createVehicle = async (req, res) => {
    try {
        const { marca, modelo, anio, precio, estado, numero_serie, kilometraje, moneda, imagen } = req.body;
        const newVehicle = await Vehiculo.create({ marca, modelo, anio, precio, estado, numero_serie, kilometraje, moneda, imagen });
        return res.status(201).json({ success: true, data: newVehicle });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

exports.updateVehicle = async (req, res) => {
    try {
        const { id } = req.params;
        const { marca, modelo, anio, precio, estado, numero_serie, kilometraje, moneda, imagen } = req.body;
        const vehicle = await Vehiculo.findByPk(id);
        if (!vehicle) return res.status(404).json({ success: false, message: 'Vehículo no encontrado' });
        
        await vehicle.update({ marca, modelo, anio, precio, estado, numero_serie, kilometraje, moneda, imagen });
        return res.status(200).json({ success: true, data: vehicle });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

exports.deleteVehicle = async (req, res) => {
    try {
        const { id } = req.params;
        const vehicle = await Vehiculo.findByPk(id);
        if (!vehicle) return res.status(404).json({ success: false, message: 'Vehículo no encontrado' });
        
        await vehicle.destroy();
        return res.status(200).json({ success: true, message: 'Vehículo eliminado' });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};
