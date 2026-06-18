const { CreditoVehicular, Cliente, Vehiculo, CostosAdicionales, DatosSalida } = require('../models');
const { calcularTIR, calcularVAN } = require('../utils/financialMath');
const exceljs = require('exceljs');

exports.simularCredito = async (req, res) => {
    try {
        const { 
            ID_Cliente, ID_Vehiculo, 
            cuota_inicial, cuota_final_porcentaje, 
            tipo_tasa, tasa_interes, capitalizacion, plazo_meses, 
            tipo_gracia, periodos_gracia, 
            seguro_desgravamen, seguro_vehicular_anual, comisiones,
            tasa_descuento_COK, tipo_moneda, tipo_cambio,
            costos_notariales, costos_registrales
        } = req.body;

        const userId = req.headers['userid'];

        const vehiculo = await Vehiculo.findByPk(ID_Vehiculo);
        if(!vehiculo) return res.status(404).json({ success: false, message: 'Vehículo no encontrado' });
        
        const cliente = await Cliente.findByPk(ID_Cliente);
        
        const tc = Number(tipo_cambio) || 1.0000;
        const precio_vehiculo = vehiculo.precio * tc;

        // 1. Preparación Financiera con valores por defecto para evitar NaN
        const precio_vehiculo_val = Number(precio_vehiculo) || 0;
        const cuota_inicial_val = Number(cuota_inicial) || 0;
        const cuota_final_porcentaje_val = Number(cuota_final_porcentaje) || 0;
        const tasa_interes_val = Number(tasa_interes) || 0;
        const plazo_meses_val = Number(plazo_meses) || 0;
        const periodos_gracia_val = Number(periodos_gracia) || 0;
        const seguro_desgravamen_val = Number(seguro_desgravamen) || 0;
        const seguro_vehicular_anual_val = Number(seguro_vehicular_anual) || 0;
        const comisiones_val = Number(comisiones) || 0;
        const costos_notariales_val = Number(costos_notariales) || 0;
        const costos_registrales_val = Number(costos_registrales) || 0;

        const monto_a_financiar = precio_vehiculo_val - cuota_inicial_val;
        const cuota_final = precio_vehiculo_val * (cuota_final_porcentaje_val / 100);
        const seguro_vehicular_mensual = seguro_vehicular_anual_val / 12;

        let TEM = 0;
        if (tipo_tasa === 'TEA') {
            TEM = Math.pow(1 + tasa_interes_val, 30 / 360) - 1;
        } else if (tipo_tasa === 'TNA') {
            let m = capitalizacion === 'Diaria' ? 360 : 12;
            let tasa_cap = tasa_interes_val / m;
            let n_periodos = capitalizacion === 'Diaria' ? 30 : 1; 
            TEM = Math.pow(1 + tasa_cap, n_periodos) - 1;
        }

        const VP_Balloon = cuota_final / Math.pow(1 + TEM, plazo_meses_val);
        let saldo_amortizable = monto_a_financiar - VP_Balloon;
        let saldo_actual = monto_a_financiar;

        let cronograma = [];
        // Perspectiva del Deudor: Recibe (positivo), Paga (negativo)
        let flujo_dia_cero = monto_a_financiar - comisiones_val - costos_notariales_val - costos_registrales_val;
        let flujos_caja = [flujo_dia_cero]; 
        let plazos_regulares = plazo_meses_val - periodos_gracia_val;

        const calcularCuotaFija = (saldo, n, tasa) => {
            if(tasa === 0) return saldo / n;
            return saldo * (tasa * Math.pow(1 + tasa, n)) / (Math.pow(1 + tasa, n) - 1);
        };

        let tasa_ajustada = TEM + seguro_desgravamen_val;

        for (let i = 1; i <= plazo_meses_val; i++) {
            let saldo_inicial_mes = saldo_actual;
            let interes = saldo_actual * TEM;
            let s_desgravamen = saldo_actual * seguro_desgravamen_val;
            let s_vehicular = precio_vehiculo_val * seguro_vehicular_mensual;
            let cuota_interes = interes;
            let amortizacion = 0;
            let cuota_total = 0;

            if (i <= periodos_gracia_val) {
                if (tipo_gracia === 'Total') {
                    amortizacion = -interes; 
                    saldo_actual += interes;
                    cuota_total = 0;
                } else if (tipo_gracia === 'Parcial') {
                    amortizacion = 0;
                    cuota_total = cuota_interes + s_desgravamen + s_vehicular;
                }
            } else {
                if (i === periodos_gracia_val + 1) {
                    let nuevo_vp_balloon = cuota_final / Math.pow(1 + TEM, plazo_meses_val - periodos_gracia_val);
                    saldo_amortizable = saldo_actual - nuevo_vp_balloon;
                }
                let cuota_fija = calcularCuotaFija(saldo_amortizable, plazos_regulares, tasa_ajustada);
                amortizacion = cuota_fija - interes - s_desgravamen;
                cuota_total = cuota_fija + s_vehicular;
                saldo_actual -= amortizacion;
            }

            if (i === plazo_meses_val) {
                // Corrección matemática para cuadrar a cero exacto en el último mes
                amortizacion = saldo_inicial_mes;
                cuota_total = amortizacion + cuota_interes + s_desgravamen + s_vehicular;
                saldo_actual = 0;
            }

            cronograma.push({
                mes: i, saldo_inicial: saldo_inicial_mes, amortizacion,
                interes: cuota_interes, seguro_desgravamen: s_desgravamen,
                seguro_vehicular: s_vehicular, cuota: cuota_total,
                saldo_final: saldo_actual < 0.01 ? 0 : saldo_actual
            });
            flujos_caja.push(-cuota_total); // El deudor paga (negativo)
        }

        const tasa_descuento_COK_val = Number(tasa_descuento_COK) || 0.10;
        const TEM_COK = Math.pow(1 + tasa_descuento_COK_val, 1 / 12) - 1;
        const TIR_mensual = calcularTIR(flujos_caja); 
        const TCEA = Math.pow(1 + TIR_mensual, 12) - 1;
        const VAN = calcularVAN(TEM_COK, flujos_caja);

        // 2. Persistencia en Base de Datos
        const adicionales = await CostosAdicionales.create({
            seguro_desgravamen, seguro_vehicular: seguro_vehicular_anual, comisiones,
            costos_notariales: costos_notariales_val, costos_registrales: costos_registrales_val
        });

        const creditoId = req.body.id; // Si viene ID, es actualización
        let credito;

        const creditData = {
            cuota_inicial, cuota_final_porcentaje, monto_financiado: monto_a_financiar,
            tipo_tasa, tasa_interes, capitalizacion, plazo_meses, tipo_moneda: tipo_moneda || 'PEN',
            tipo_cambio: tc,
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
            include: [Cliente, Vehiculo, CostosAdicionales, DatosSalida]
        });

        if(!credito) return res.status(404).send('Crédito no encontrado');

        const workbook = new exceljs.Workbook();
        const sheet = workbook.addWorksheet('Reporte Simulacion');

        if (credito.Vehiculo && credito.Vehiculo.imagen && credito.Vehiculo.imagen.includes('base64,')) {
            try {
                const mimeMatch = credito.Vehiculo.imagen.match(/data:image\/([a-zA-Z0-9]+);base64,/);
                let ext = 'png';
                if (mimeMatch && mimeMatch[1]) {
                    ext = mimeMatch[1].toLowerCase();
                    if (ext === 'jpg') ext = 'jpeg';
                }

                const base64Data = credito.Vehiculo.imagen.split('base64,')[1];
                const imageId = workbook.addImage({
                    base64: base64Data,
                    extension: ext,
                });
                sheet.addImage(imageId, {
                    tl: { col: 6, row: 1 },
                    ext: { width: 150, height: 100 }
                });
            } catch (e) {
                console.error('Error adding image to excel:', e);
            }
        }

        const moneda = credito.tipo_moneda === 'USD' ? '$' : 'S/';

        // Datos del Cliente
        sheet.getCell('A1').value = 'Datos del Cliente';
        sheet.getCell('A1').font = { bold: true };
        sheet.getCell('A2').value = `Nombres: ${credito.Cliente?.nombre || ''} ${credito.Cliente?.apellido || ''}`;
        sheet.getCell('A3').value = `DNI: ${credito.Cliente?.dni || 'N/A'}`;
        sheet.getCell('A4').value = `Celular: ${credito.Cliente?.celular || 'N/A'}`;
        sheet.getCell('A5').value = `Dirección: ${credito.Cliente?.direccion || 'N/A'}`;
        sheet.getCell('A6').value = `Ocupación: ${credito.Cliente?.ocupacion || 'N/A'}`;
        sheet.getCell('A7').value = `Estado Civil: ${credito.Cliente?.estado_civil || 'N/A'}`;
        sheet.getCell('A8').value = `Género: ${credito.Cliente?.genero || 'N/A'}`;

        // Datos del Vehículo
        sheet.getCell('D1').value = 'Datos del Vehículo';
        sheet.getCell('D1').font = { bold: true };
        sheet.getCell('D2').value = `Marca/Modelo: ${credito.Vehiculo?.marca} ${credito.Vehiculo?.modelo}`;
        sheet.getCell('D3').value = `Estado: ${credito.Vehiculo?.estado || 'N/A'}`;
        sheet.getCell('D4').value = `N° Serie: ${credito.Vehiculo?.numero_serie || 'N/A'}`;
        sheet.getCell('D5').value = `Kilometraje: ${credito.Vehiculo?.kilometraje || 0} km`;
        sheet.getCell('D6').value = `Precio: ${moneda}${Number(credito.Vehiculo?.precio).toFixed(2)}`;

        // Resultados Financieros y Costos Iniciales
        sheet.getCell('A10').value = 'Resumen y Costos Iniciales';
        sheet.getCell('A10').font = { bold: true };
        sheet.getCell('A11').value = `TCEA: ${(credito.DatosSalida?.TCEA * 100).toFixed(2)}%`;
        sheet.getCell('A12').value = `VAN: ${moneda}${Number(credito.DatosSalida?.VAN).toFixed(2)}`;
        sheet.getCell('A13').value = `Cuota Referencial: ${moneda}${Number(credito.DatosSalida?.cuota_mensual).toFixed(2)}`;
        
        sheet.getCell('D10').value = 'Parámetros Adicionales';
        sheet.getCell('D10').font = { bold: true };
        sheet.getCell('D11').value = `Tipo de Cambio Aplicado: ${Number(credito.tipo_cambio || 1).toFixed(4)}`;
        sheet.getCell('D12').value = `Costos Notariales (Día 0): ${moneda}${Number(credito.CostosAdicionale?.costos_notariales || 0).toFixed(2)}`;
        sheet.getCell('D13').value = `Costos Registrales (Día 0): ${moneda}${Number(credito.CostosAdicionale?.costos_registrales || 0).toFixed(2)}`;

        // Espacio antes del cronograma
        sheet.addRow([]);
        
        const tableRowStart = 15;

        sheet.getRow(tableRowStart).values = [
            'Mes', 'Saldo Inicial', 'Amortización', 'Interés', 
            'Seguro Desgravamen', 'Seguro Vehicular', 'Cuota', 'Saldo Final'
        ];
        sheet.getRow(tableRowStart).font = { bold: true };
        
        sheet.columns = [
            { key: 'mes', width: 10 },
            { key: 'saldo_inicial', width: 15 },
            { key: 'amortizacion', width: 15 },
            { key: 'interes', width: 15 },
            { key: 'seguro_desgravamen', width: 20 },
            { key: 'seguro_vehicular', width: 20 },
            { key: 'cuota', width: 15 },
            { key: 'saldo_final', width: 15 },
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
