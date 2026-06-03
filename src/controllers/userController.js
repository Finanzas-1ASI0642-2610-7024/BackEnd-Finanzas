const { Usuario } = require('../models');

exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await Usuario.findOne({ where: { nombre: username, contrasena: password } });
        
        if (!user) {
            return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
        }

        // En un caso real usaríamos JWT, pero para este trabajo enviaremos los datos básicos
        return res.status(200).json({
            success: true,
            user: {
                id: user.id,
                username: user.nombre,
                rol: user.rol
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

exports.getUsers = async (req, res) => {
    try {
        const users = await Usuario.findAll({ attributes: ['id', 'nombre', 'rol'] });
        return res.status(200).json({ success: true, data: users });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

exports.createUser = async (req, res) => {
    try {
        const { username, password, rol } = req.body;
        const exists = await Usuario.findOne({ where: { nombre: username } });
        if (exists) {
            return res.status(400).json({ success: false, message: 'El usuario ya existe' });
        }
        const newUser = await Usuario.create({ nombre: username, contrasena: password, rol: rol || 'user' });
        return res.status(201).json({ success: true, data: newUser });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

exports.deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        await Usuario.destroy({ where: { id } });
        return res.status(200).json({ success: true, message: 'Usuario eliminado' });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};
