const { CreditoVehicular, Cliente, Vehiculo, CostosAdicionales, DatosSalida } = require('../models');
const { calcularTIR, calcularVAN } = require('../utils/financialMath');
const exceljs = require('exceljs');

exports.simularCredito = async (req, res) => {
    try {
        const { 
            precio_vehiculo, cuota_inicial, cuota_final_porcentaje, 
            tipo_tasa, tasa_interes, capitalizacion, plazo_meses, 
            tipo_gracia, periodos_gracia, 
            seguro_desgravamen, seguro_vehicular_anual, comisiones,
            // Nuevos datos del cliente y vehiculo
            cliente_nombre, cliente_dni, cliente_ingreso, cliente_edad,
            vehiculo_marca, vehiculo_modelo, vehiculo_anio
        } = req.body;

        const userId = req.headers['userid'];

        // 1. Preparación Financiera
        const monto_a_financiar = precio_vehiculo - cuota_inicial;
        const cuota_final = precio_vehiculo * (cuota_final_porcentaje / 100);
        const seguro_vehicular_mensual = seguro_vehicular_anual / 12;

        let TEM = 0;
        if (tipo_tasa === 'TEA') {
            TEM = Math.pow(1 + tasa_interes, 30 / 360) - 1;
        } else if (tipo_tasa === 'TNA') {
            let m = capitalizacion === 'Diaria' ? 360 : 12;
            let tasa_cap = tasa_interes / m;
            let n_periodos = capitalizacion === 'Diaria' ? 30 : 1; 
            TEM = Math.pow(1 + tasa_cap, n_periodos) - 1;
        }

        const VP_Balloon = cuota_final / Math.pow(1 + TEM, plazo_meses);
        let saldo_amortizable = monto_a_financiar - VP_Balloon;
        let saldo_actual = monto_a_financiar;

        let cronograma = [];
        let flujos_caja = [-monto_a_financiar + (comisiones || 0)]; 
        let plazos_regulares = plazo_meses - (periodos_gracia || 0);

        const calcularCuotaFija = (saldo, n, tasa) => {
            if(tasa === 0) return saldo / n;
            return saldo * (tasa * Math.pow(1 + tasa, n)) / (Math.pow(1 + tasa, n) - 1);
        };

        for (let i = 1; i <= plazo_meses; i++) {
            let interes = saldo_actual * TEM;
            let s_desgravamen = saldo_actual * seguro_desgravamen;
            let s_vehicular = precio_vehiculo * seguro_vehicular_mensual;
            let cuota_interes = interes;
            let amortizacion = 0;
            let cuota_total = 0;

            if (i <= (periodos_gracia || 0)) {
                if (tipo_gracia === 'Total') {
                    amortizacion = -interes; 
                    saldo_actual += interes;
                    cuota_total = 0;
                } else if (tipo_gracia === 'Parcial') {
                    amortizacion = 0;
                    cuota_total = cuota_interes + s_desgravamen + s_vehicular;
                }
            } else {
                if (i === (periodos_gracia || 0) + 1) {
                    let nuevo_vp_balloon = cuota_final / Math.pow(1 + TEM, plazo_meses - (periodos_gracia || 0));
                    saldo_amortizable = saldo_actual - nuevo_vp_balloon;
                }
                let cuota_francesa = calcularCuotaFija(saldo_amortizable, plazos_regulares, TEM);
                amortizacion = cuota_francesa - interes;
                cuota_total = cuota_francesa + s_desgravamen + s_vehicular;
                saldo_actual -= amortizacion;
            }

            if (i === plazo_meses) {
                cuota_total += cuota_final;
                amortizacion += cuota_final;
                saldo_actual = 0;
            }

            cronograma.push({
                mes: i, saldo_inicial: saldo_actual + amortizacion, amortizacion,
                interes: cuota_interes, seguro_desgravamen: s_desgravamen,
                seguro_vehicular: s_vehicular, cuota: cuota_total,
                saldo_final: saldo_actual < 0.01 ? 0 : saldo_actual
            });
            flujos_caja.push(cuota_total);
        }

        const tasa_descuento_COK = 0.10;
        const TEM_COK = Math.pow(1 + tasa_descuento_COK, 1 / 12) - 1;
        const TIR_mensual = calcularTIR(flujos_caja); 
        const TCEA = Math.pow(1 + TIR_mensual, 12) - 1;
        const VAN = calcularVAN(TEM_COK, flujos_caja);

        // 2. Persistencia en Base de Datos
        // Guardar Cliente (O buscarlo por DNI)
        let cliente;
        if(cliente_dni) {
            [cliente] = await Cliente.findOrCreate({
                where: { dni: cliente_dni },
                defaults: { nombre: cliente_nombre, ingreso_mensual: cliente_ingreso, edad: cliente_edad }
            });
        }

        const vehiculo = await Vehiculo.create({
            marca: vehiculo_marca || 'N/A', modelo: vehiculo_modelo || 'N/A', 
            anio: vehiculo_anio || 2024, precio: precio_vehiculo
        });

        const adicionales = await CostosAdicionales.create({
            seguro_desgravamen, seguro_vehicular: seguro_vehicular_anual, comisiones
        });

        const creditoId = req.body.id; // Si viene ID, es actualización
        let credito;

        const creditData = {
            cuota_inicial, cuota_final_porcentaje, monto_financiado: monto_a_financiar,
            tipo_tasa, tasa_interes, capitalizacion, plazo_meses,
            tipo_gracia, periodos_gracia, ID_Usuario_Creador: userId,
            ID_Cliente: cliente?.id, ID_Vehiculo: vehiculo.id, ID_Adicionales: adicionales.id
        };

        if (creditoId) {
            credito = await CreditoVehicular.findByPk(creditoId);
            if(credito) {
                await credito.update(creditData);
                // Borrar datos salida anteriores
                await DatosSalida.destroy({ where: { ID_Credito: creditoId } });
            }
        } else {
            credito = await CreditoVehicular.create(creditData);
        }

        const cuota_mensual_ref = cronograma[(periodos_gracia || 0)] ? cronograma[(periodos_gracia || 0)].cuota : 0;
        await DatosSalida.create({
            monto_financiado: monto_a_financiar, cuota_mensual: cuota_mensual_ref,
            cuota_final, TCEA, VAN, TIR: TIR_mensual,
            cronograma_pagos_json: JSON.stringify(cronograma),
            ID_Credito: credito.id
        });

        return res.status(200).json({
            success: true,
            data: {
                id: credito.id,
                monto_financiado: monto_a_financiar, TEM, TCEA, VAN, TIR_mensual,
                cuota_mensual_referencial: cuota_mensual_ref, cuota_final, cronograma
            }
        });

    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

exports.getHistorial = async (req, res) => {
    try {
        const userId = req.headers['userid'];
        const role = req.headers['role'];
        let whereClause = {};

        if (role !== 'admin' && userId) {
            whereClause.ID_Usuario_Creador = userId;
        }

        const creditos = await CreditoVehicular.findAll({
            where: whereClause,
            include: [Cliente, Vehiculo, DatosSalida],
            order: [['createdAt', 'DESC']]
        });

        return res.status(200).json({ success: true, data: creditos });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

exports.getSimulacionById = async (req, res) => {
    try {
        const { id } = req.params;
        const credito = await CreditoVehicular.findByPk(id, {
            include: [Cliente, Vehiculo, CostosAdicionales, DatosSalida]
        });
        if(!credito) return res.status(404).json({ success: false, message: 'No encontrado' });
        return res.status(200).json({ success: true, data: credito });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

exports.otorgarCredito = async (req, res) => {
    try {
        const { id } = req.params;
        const credito = await CreditoVehicular.findByPk(id);
        if(!credito) return res.status(404).json({ success: false, message: 'No encontrado' });
        
        await credito.update({ estado: 'Otorgado' });
        return res.status(200).json({ success: true, message: 'Crédito otorgado exitosamente' });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

exports.exportarExcel = async (req, res) => {
    try {
        const { id } = req.params;
        const credito = await CreditoVehicular.findByPk(id, {
            include: [Cliente, Vehiculo, DatosSalida]
        });

        if(!credito) return res.status(404).send('Crédito no encontrado');

        const workbook = new exceljs.Workbook();
        const sheet = workbook.addWorksheet('Cronograma');

        sheet.columns = [
            { header: 'Mes', key: 'mes', width: 10 },
            { header: 'Saldo Inicial', key: 'saldo_inicial', width: 15 },
            { header: 'Amortización', key: 'amortizacion', width: 15 },
            { header: 'Interés', key: 'interes', width: 15 },
            { header: 'Seguro Desgravamen', key: 'seguro_desgravamen', width: 20 },
            { header: 'Seguro Vehicular', key: 'seguro_vehicular', width: 20 },
            { header: 'Cuota', key: 'cuota', width: 15 },
            { header: 'Saldo Final', key: 'saldo_final', width: 15 },
        ];

        let cronograma = [];
        if (credito.DatosSalida && credito.DatosSalida.cronograma_pagos_json) {
            cronograma = JSON.parse(credito.DatosSalida.cronograma_pagos_json);
        }

        cronograma.forEach(row => {
            sheet.addRow({
                mes: row.mes,
                saldo_inicial: Number(row.saldo_inicial).toFixed(2),
                amortizacion: Number(row.amortizacion).toFixed(2),
                interes: Number(row.interes).toFixed(2),
                seguro_desgravamen: Number(row.seguro_desgravamen).toFixed(2),
                seguro_vehicular: Number(row.seguro_vehicular).toFixed(2),
                cuota: Number(row.cuota).toFixed(2),
                saldo_final: Number(row.saldo_final).toFixed(2)
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Simulacion_${id}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        return res.status(500).send(error.message);
    }
};

exports.getAdminMetrics = async (req, res) => {
    try {
        // Obtenemos solo los créditos otorgados
        const otorgados = await CreditoVehicular.findAll({
            where: { estado: 'Otorgado' },
            include: [DatosSalida]
        });

        let totalMonto = 0;
        let sumTCEA = 0;
        otorgados.forEach(c => {
            totalMonto += parseFloat(c.monto_financiado);
            if(c.DatosSalida) sumTCEA += parseFloat(c.DatosSalida.TCEA);
        });

        const metrics = {
            total_otorgados: otorgados.length,
            monto_total_financiado: totalMonto,
            tcea_promedio: otorgados.length > 0 ? (sumTCEA / otorgados.length) * 100 : 0
        };

        return res.status(200).json({ success: true, data: metrics });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};
