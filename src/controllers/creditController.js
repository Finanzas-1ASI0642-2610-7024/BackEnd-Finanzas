const { CreditoVehicular, Cliente, Vehiculo, CostosAdicionales, DatosSalida } = require('../models');
const { calcularTIR, calcularVAN } = require('../utils/financialMath');
const exceljs = require('exceljs');

exports.simularCredito = async (req, res) => {
    try {
        const { 
            ID_Cliente, ID_Vehiculo, 
            cuota_inicial_porcentaje, cuota_final_porcentaje, 
            tipo_tasa, tasa_interes, capitalizacion, numero_anios, 
            frecuencia_pago_dias, dias_por_anio,
            tipo_gracia, periodos_gracia, 
            seguro_desgravamen, seguro_vehicular_anual, comisiones,
            tasa_descuento_COK, tipo_moneda, tipo_cambio,
            costos_notariales, costos_registrales, tasacion, comision_estudio, comision_activacion,
            portes, gastos_administracion
        } = req.body;

        const userId = req.headers['userid'];

        const vehiculo = await Vehiculo.findByPk(ID_Vehiculo);
        if(!vehiculo) return res.status(404).json({ success: false, message: 'Vehículo no encontrado' });
        
        const cliente = await Cliente.findByPk(ID_Cliente);
        
        const tc = Number(tipo_cambio) || 1.0000;
        const precio_vehiculo = vehiculo.precio * tc;

        // 1. Preparación Financiera con valores por defecto para evitar NaN
        const precio_vehiculo_val = Number(precio_vehiculo) || 0;
        const cuota_inicial_porcentaje_val = Number(cuota_inicial_porcentaje) || 0;
        const cuota_inicial_val = precio_vehiculo_val * (cuota_inicial_porcentaje_val / 100);
        const cuota_final_porcentaje_val = Number(cuota_final_porcentaje) || 0;
        const tasa_interes_val = Number(tasa_interes) || 0;
        
        const numero_anios_val = Number(numero_anios) || 0;
        const frecuencia_pago_dias_val = Number(frecuencia_pago_dias) || 30;
        const dias_por_anio_val = Number(dias_por_anio) || 360;
        const plazo_total_periodos = Math.round((numero_anios_val * dias_por_anio_val) / frecuencia_pago_dias_val);
        
        const periodos_gracia_val = Number(periodos_gracia) || 0;
        const seguro_desgravamen_val = Number(seguro_desgravamen) || 0;
        const seguro_vehicular_anual_val = Number(seguro_vehicular_anual) || 0;
        const comisiones_val = Number(comisiones) || 0;
        const costos_notariales_val = Number(costos_notariales) || 0;
        const costos_registrales_val = Number(costos_registrales) || 0;
        const tasacion_val = Number(tasacion) || 0;
        const comision_estudio_val = Number(comision_estudio) || 0;
        const comision_activacion_val = Number(comision_activacion) || 0;
        const portes_val = Number(portes) || 0;
        const gastos_administracion_val = Number(gastos_administracion) || 0;

        const monto_a_financiar = precio_vehiculo_val - cuota_inicial_val;
        const monto_del_prestamo = monto_a_financiar + costos_notariales_val + costos_registrales_val + tasacion_val + comision_estudio_val + comision_activacion_val;
        const cuota_final = precio_vehiculo_val * (cuota_final_porcentaje_val / 100);
        // Ajuste de seguro vehicular para el periodo: anual -> diario -> por periodo
        const seguro_vehicular_periodo = (seguro_vehicular_anual_val / dias_por_anio_val) * frecuencia_pago_dias_val;

        let TEP = 0;
        if (tipo_tasa === 'TEA') {
            TEP = Math.pow(1 + tasa_interes_val, frecuencia_pago_dias_val / dias_por_anio_val) - 1;
        } else if (tipo_tasa === 'TNA') {
            let m = capitalizacion === 'Diaria' ? dias_por_anio_val : 12; // asumiendo 12 meses
            let tasa_cap = tasa_interes_val / m;
            let n_periodos = capitalizacion === 'Diaria' ? frecuencia_pago_dias_val : (frecuencia_pago_dias_val / 30); 
            TEP = Math.pow(1 + tasa_cap, n_periodos) - 1;
        }

        const VP_Balloon = cuota_final / Math.pow(1 + TEP, plazo_total_periodos);
        let saldo_amortizable = monto_del_prestamo - VP_Balloon;
        let saldo_actual = monto_del_prestamo;

        let cronograma = [];
        // Perspectiva del Deudor: Recibe el Préstamo (positivo), Paga Cuotas (negativo)
        let flujo_dia_cero = monto_del_prestamo; // Según teoría: 0 = Préstamo - Sum(...)
        let flujos_caja = [flujo_dia_cero]; 
        let plazos_regulares = plazo_total_periodos - periodos_gracia_val;

        // Añadir Mes 0
        cronograma.push({
            mes: 0, saldo_inicial: 0, amortizacion: 0,
            interes: 0, seguro_desgravamen: 0, seguro_vehicular: 0,
            portes: 0, comisiones: 0, cuota: 0, saldo_final: monto_del_prestamo,
            flujo_caja: flujo_dia_cero
        });

        const calcularCuotaFija = (saldo, n, tasa) => {
            if(tasa === 0) return saldo / n;
            return saldo * (tasa * Math.pow(1 + tasa, n)) / (Math.pow(1 + tasa, n) - 1);
        };

        let tasa_ajustada = TEP + seguro_desgravamen_val;

        for (let i = 1; i <= plazo_total_periodos; i++) {
            let saldo_inicial_mes = saldo_actual;
            let interes = saldo_actual * TEP;
            let s_desgravamen = saldo_actual * seguro_desgravamen_val;
            let s_vehicular = precio_vehiculo_val * seguro_vehicular_periodo;
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
                    cuota_total = cuota_interes + s_desgravamen + s_vehicular + portes_val + gastos_administracion_val + comisiones_val;
                }
            } else {
                if (i === periodos_gracia_val + 1) {
                    let nuevo_vp_balloon = cuota_final / Math.pow(1 + TEP, plazo_total_periodos - periodos_gracia_val);
                    saldo_amortizable = saldo_actual - nuevo_vp_balloon;
                }
                let cuota_fija = calcularCuotaFija(saldo_amortizable, plazos_regulares, tasa_ajustada);
                amortizacion = cuota_fija - interes - s_desgravamen;
                
                // Si estamos en el último periodo, ajustamos para que quede exactamente en 0 o en el globo (si lo hay) por temas de decimales
                if (i === plazo_total_periodos) {
                    if (cuota_final > 0) {
                        amortizacion = saldo_actual - cuota_final;
                    } else {
                        amortizacion = saldo_actual;
                    }
                }
                
                cuota_total = amortizacion + cuota_interes + s_desgravamen + s_vehicular + portes_val + gastos_administracion_val + comisiones_val;
                saldo_actual -= amortizacion;
            }

            cronograma.push({
                mes: i, saldo_inicial: saldo_inicial_mes, amortizacion,
                interes: cuota_interes, seguro_desgravamen: s_desgravamen,
                seguro_vehicular: s_vehicular, 
                portes: portes_val + gastos_administracion_val,
                comisiones: comisiones_val,
                cuota: cuota_total,
                saldo_final: saldo_actual < 0.01 ? 0 : saldo_actual,
                flujo_caja: -cuota_total
            });
            flujos_caja.push(-cuota_total); // El deudor paga (negativo)
        }

        const tasa_descuento_COK_val = Number(tasa_descuento_COK) || 0.10;
        // TEP_COK para descontar flujos periódicos
        const TEP_COK = Math.pow(1 + tasa_descuento_COK_val, frecuencia_pago_dias_val / dias_por_anio_val) - 1;
        const TIR_periodo = calcularTIR(flujos_caja); 
        // Anualizando la TIR para obtener la TCEA
        const TCEA = Math.pow(1 + TIR_periodo, dias_por_anio_val / frecuencia_pago_dias_val) - 1;
        const VAN = calcularVAN(TEP_COK, flujos_caja);

        // 2. Persistencia en Base de Datos
        const adicionales = await CostosAdicionales.create({
            seguro_desgravamen, seguro_vehicular: seguro_vehicular_anual, comisiones,
            costos_notariales: costos_notariales_val, costos_registrales: costos_registrales_val,
            tasacion: tasacion_val, comision_estudio: comision_estudio_val, comision_activacion: comision_activacion_val,
            portes: portes_val, gastos_administracion: gastos_administracion_val
        });

        const creditoId = req.body.id; // Si viene ID, es actualización
        let credito;

        const creditData = {
            cuota_inicial_porcentaje, cuota_final_porcentaje, monto_financiado: monto_a_financiar,
            tipo_tasa, tasa_interes, capitalizacion, numero_anios, frecuencia_pago_dias, dias_por_anio,
            tipo_moneda: tipo_moneda || 'PEN',
            tipo_cambio: tc, tasa_descuento_COK: tasa_descuento_COK_val,
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

        const cuota_mensual_ref = cronograma[(periodos_gracia_val || 0)] ? cronograma[(periodos_gracia_val || 0)].cuota : 0;
        
        await DatosSalida.create({
            monto_financiado: monto_a_financiar, cuota_mensual: cuota_mensual_ref,
            cuota_final, TCEA, VAN, TIR: TIR_periodo,
            cronograma_pagos_json: JSON.stringify(cronograma),
            ID_Credito: credito.id
        });

        // Calcular Totales para UI
        const totales = cronograma.reduce((acc, curr) => {
            acc.interes += curr.interes;
            acc.amortizacion += curr.amortizacion;
            acc.seguro_desgravamen += curr.seguro_desgravamen;
            acc.seguro_vehicular += curr.seguro_vehicular;
            acc.comisiones += comisiones_val;
            acc.portes_gastos += (portes_val + gastos_administracion_val);
            return acc;
        }, {
            interes: 0, amortizacion: 0, seguro_desgravamen: 0, 
            seguro_vehicular: 0, comisiones: 0, portes_gastos: 0
        });

        return res.status(200).json({
            success: true,
            data: {
                id: credito.id,
                monto_financiado: monto_a_financiar, 
                monto_del_prestamo,
                TEP, TCEA, VAN, TIR_periodo, TEP_COK,
                cuota_mensual_referencial: cuota_mensual_ref, cuota_final, cronograma,
                cuota_inicial: cuota_inicial_val, // Devolvemos el absoluto para la vista
                totales
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
            include: [Cliente, Vehiculo, DatosSalida, Usuario],
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
        workbook.creator = 'AutoTech Finanzas';
        workbook.created = new Date();
        const sheet = workbook.addWorksheet('Reporte de Crédito', {
            views: [{ showGridLines: false }]
        });

        const moneda = credito.tipo_moneda === 'USD' ? '$' : 'S/';
        const monedaFormat = moneda === '$' ? '"$"#,##0.00' : '"S/"#,##0.00';

        // ═══════════════════════════════════════════════════════════════
        // PALETA DE COLORES CORPORATIVA FORMAL
        // ═══════════════════════════════════════════════════════════════
        const CORP_BLUE = 'FF003366';   // Azul corporativo oscuro
        const CORP_LIGHT = 'FFF0F4F8';  // Azul muy claro para fondos
        const HEADER_BG = 'FFEAECEE';   // Gris claro para encabezados
        const TEXT_MAIN = 'FF1C2833';   // Casi negro para texto principal
        const TEXT_MUTED = 'FF566573';  // Gris para etiquetas
        const WHITE = 'FFFFFFFF';       // Blanco

        // ═══════════════════════════════════════════════════════════════
        // ANCHOS DE COLUMNA EQUILIBRADOS PARA LA TABLA DE 8 COLUMNAS
        // ═══════════════════════════════════════════════════════════════
        sheet.columns = [
            { key: 'A', width: 8 },   // N°
            { key: 'B', width: 20 },  // Saldo Inicial
            { key: 'C', width: 20 },  // Amortización
            { key: 'D', width: 18 },  // Interés
            { key: 'E', width: 22 },  // Seg. Desgravamen
            { key: 'F', width: 20 },  // Seg. Vehicular
            { key: 'G', width: 18 },  // Cuota Total
            { key: 'H', width: 20 }   // Saldo Final
        ];

        // ═══════════════════════════════════════════════════════════════
        // TÍTULO PRINCIPAL (filas 1-4)
        // ═══════════════════════════════════════════════════════════════
        sheet.mergeCells('A1:H2');
        const titleCell = sheet.getCell('A1');
        titleCell.value = 'REPORTE DE SIMULACIÓN DE CRÉDITO VEHICULAR';
        titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: CORP_BLUE } };
        titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
        
        sheet.mergeCells('A3:H3');
        const subtitleCell = sheet.getCell('A3');
        subtitleCell.value = `Generado el: ${new Date().toLocaleDateString('es-PE')} | Confidencial`;
        subtitleCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: TEXT_MUTED } };
        subtitleCell.alignment = { vertical: 'middle', horizontal: 'center' };
        
        // Línea divisoria
        sheet.getRow(4).height = 5;
        sheet.mergeCells('A4:H4');
        sheet.getCell('A4').border = { bottom: { style: 'medium', color: { argb: CORP_BLUE } } };

        sheet.getRow(5).height = 15; // Espacio

        // ═══════════════════════════════════════════════════════════════
        // FUNCIONES HELPER FORMALES
        // ═══════════════════════════════════════════════════════════════
        const crearEncabezadoSeccion = (rangoMerge, texto) => {
            sheet.mergeCells(rangoMerge);
            const celdaInicio = rangoMerge.split(':')[0];
            const cell = sheet.getCell(celdaInicio);
            cell.value = texto;
            cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: CORP_BLUE } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
            cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
            cell.border = { 
                top: { style: 'thin', color: { argb: CORP_BLUE } },
                bottom: { style: 'thin', color: { argb: CORP_BLUE } }
            };
        };

        const agregarDatoFormal = (rangoEtiqueta, rangoValor, etiqueta, valor, isCurrency = false) => {
            sheet.mergeCells(rangoEtiqueta);
            sheet.mergeCells(rangoValor);
            const celdaEtiqueta = rangoEtiqueta.split(':')[0];
            const celdaValor = rangoValor.split(':')[0];

            const lblCell = sheet.getCell(celdaEtiqueta);
            lblCell.value = etiqueta;
            lblCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: TEXT_MUTED } };
            lblCell.alignment = { vertical: 'middle', horizontal: 'left' };
            lblCell.border = { bottom: { style: 'hair', color: { argb: HEADER_BG } } };

            const valCell = sheet.getCell(celdaValor);
            valCell.value = valor;
            valCell.font = { name: 'Arial', size: 10, color: { argb: TEXT_MAIN } };
            valCell.alignment = { vertical: 'middle', horizontal: 'right' };
            valCell.border = { bottom: { style: 'hair', color: { argb: HEADER_BG } } };
            if (isCurrency && typeof valor === 'number') {
                valCell.numFmt = monedaFormat;
            }
        };

        // ═══════════════════════════════════════════════════════════════
        // SECCIÓN 1: DATOS CLIENTE Y VEHÍCULO (filas 6-11)
        // ═══════════════════════════════════════════════════════════════
        sheet.getRow(6).height = 24;
        crearEncabezadoSeccion('A6:D6', 'DATOS DEL CLIENTE');
        crearEncabezadoSeccion('E6:H6', 'DATOS DEL VEHÍCULO');

        [7, 8, 9, 10, 11].forEach(r => sheet.getRow(r).height = 20);

        agregarDatoFormal('A7:B7', 'C7:D7', 'Nombres y Apellidos:', `${credito.Cliente?.nombre || ''} ${credito.Cliente?.apellido || ''}`);
        agregarDatoFormal('A8:B8', 'C8:D8', 'Documento de Identidad:', credito.Cliente?.dni || 'N/A');
        agregarDatoFormal('A9:B9', 'C9:D9', 'Teléfono / Celular:', credito.Cliente?.celular || 'N/A');
        agregarDatoFormal('A10:B10', 'C10:D10', 'Ocupación:', credito.Cliente?.ocupacion || 'N/A');
        agregarDatoFormal('A11:B11', 'C11:D11', 'Dirección:', credito.Cliente?.direccion || 'N/A');

        agregarDatoFormal('E7:F7', 'G7:H7', 'Marca / Modelo:', `${credito.Vehiculo?.marca} ${credito.Vehiculo?.modelo}`);
        agregarDatoFormal('E8:F8', 'G8:H8', 'Condición:', credito.Vehiculo?.estado || 'N/A');
        agregarDatoFormal('E9:F9', 'G9:H9', 'Kilometraje:', `${Number(credito.Vehiculo?.kilometraje || 0).toLocaleString()} km`);
        agregarDatoFormal('E10:F10', 'G10:H10', 'Precio del Vehículo:', Number(credito.Vehiculo?.precio), true);
        
        // Imagen
        if (credito.Vehiculo && credito.Vehiculo.imagen && credito.Vehiculo.imagen.includes('base64,')) {
            try {
                const mimeMatch = credito.Vehiculo.imagen.match(/data:image\/([a-zA-Z0-9]+);base64,/);
                let ext = 'png';
                if (mimeMatch && mimeMatch[1]) {
                    ext = mimeMatch[1].toLowerCase();
                    if (ext === 'jpg') ext = 'jpeg';
                }
                const base64Data = credito.Vehiculo.imagen.split('base64,')[1];
                const imageId = workbook.addImage({ base64: base64Data, extension: ext });
                sheet.addImage(imageId, {
                    tl: { col: 4.5, row: 6.2 },
                    ext: { width: 140, height: 85 }
                });
            } catch (e) {
                console.error('Error adding image to excel:', e);
            }
        }

        sheet.getRow(12).height = 15; // Espacio

        // ═══════════════════════════════════════════════════════════════
        // CÁLCULOS FINANCIEROS
        // ═══════════════════════════════════════════════════════════════
        let cronograma = [];
        if (credito.DatosSalida && credito.DatosSalida.cronograma_pagos_json) {
            cronograma = JSON.parse(credito.DatosSalida.cronograma_pagos_json);
        }

        const totales = cronograma.reduce((acc, curr) => {
            acc.interes += curr.interes;
            acc.amortizacion += curr.amortizacion;
            acc.seguro_desgravamen += curr.seguro_desgravamen;
            acc.seguro_vehicular += curr.seguro_vehicular;
            return acc;
        }, { interes: 0, amortizacion: 0, seguro_desgravamen: 0, seguro_vehicular: 0 });

        const numero_cuotas = cronograma.length;
        const comisiones_totales = (Number(credito.CostosAdicionale?.comisiones) || 0) * numero_cuotas;
        const portes_gastos_totales = ((Number(credito.CostosAdicionale?.portes) || 0) + (Number(credito.CostosAdicionale?.gastos_administracion) || 0)) * numero_cuotas;
        const tasa_descuento_COK_val = Number(credito.tasa_descuento_COK) || 0.10;
        const frecuencia_pago_dias_val = Number(credito.frecuencia_pago_dias) || 30;
        const dias_por_anio_val = Number(credito.dias_por_anio) || 360;
        const TEP_COK = Math.pow(1 + tasa_descuento_COK_val, frecuencia_pago_dias_val / dias_por_anio_val) - 1;
        const gastos_iniciales = (Number(credito.CostosAdicionale?.tasacion) || 0) +
                                 (Number(credito.CostosAdicionale?.comision_estudio) || 0) +
                                 (Number(credito.CostosAdicionale?.comision_activacion) || 0) +
                                 (Number(credito.CostosAdicionale?.costos_notariales) || 0) +
                                 (Number(credito.CostosAdicionale?.costos_registrales) || 0);
        const monto_del_prestamo = Number(credito.DatosSalida?.monto_financiado) + gastos_iniciales;

        // ═══════════════════════════════════════════════════════════════
        // SECCIÓN 2: CONDICIONES DEL CRÉDITO (filas 13-17)
        // ═══════════════════════════════════════════════════════════════
        sheet.getRow(13).height = 24;
        crearEncabezadoSeccion('A13:H13', 'CONDICIONES DEL CRÉDITO Y GASTOS');

        [14, 15, 16, 17].forEach(r => sheet.getRow(r).height = 20);

        // Columna 1
        agregarDatoFormal('A14:B14', 'C14:C14', 'Monto a Financiar:', Number(credito.DatosSalida?.monto_financiado), true);
        agregarDatoFormal('A15:B15', 'C15:C15', 'Gastos Iniciales:', gastos_iniciales, true);
        agregarDatoFormal('A16:B16', 'C16:C16', 'Monto Total Préstamo:', monto_del_prestamo, true);
        agregarDatoFormal('A17:B17', 'C17:C17', 'N° de Cuotas:', numero_cuotas);

        // Columna 2
        agregarDatoFormal('D14:E14', 'F14:F14', 'Tasa Descuento (TEP):', `${(TEP_COK * 100).toFixed(4)}%`);
        agregarDatoFormal('D15:E15', 'F15:F15', 'TIR Periodo:', `${(Number(credito.DatosSalida?.TIR || 0) * 100).toFixed(4)}%`);
        agregarDatoFormal('D16:E16', 'F16:F16', 'TCEA:', `${(Number(credito.DatosSalida?.TCEA || 0) * 100).toFixed(4)}%`);
        agregarDatoFormal('D17:E17', 'F17:F17', 'VAN:', Number(credito.DatosSalida?.VAN || 0), true);

        // Columna 3
        agregarDatoFormal('G14:G14', 'H14:H14', 'Intereses Totales:', totales.interes, true);
        agregarDatoFormal('G15:G15', 'H15:H15', 'Seguro Desgravamen:', totales.seguro_desgravamen, true);
        agregarDatoFormal('G16:G16', 'H16:H16', 'Seguro Vehicular:', totales.seguro_vehicular, true);
        agregarDatoFormal('G17:G17', 'H17:H17', 'Portes/Comisiones:', comisiones_totales + portes_gastos_totales, true);

        sheet.getRow(18).height = 15; // Espacio

        // ═══════════════════════════════════════════════════════════════
        // CRONOGRAMA DE PAGOS (fila 19+)
        // ═══════════════════════════════════════════════════════════════
        const tableRowStart = 20;

        // Título del cronograma
        sheet.getRow(19).height = 24;
        crearEncabezadoSeccion('A19:H19', 'CRONOGRAMA DE PAGOS');

        // Header de tabla
        sheet.getRow(tableRowStart).height = 30;
        sheet.getRow(tableRowStart).values = [
            'N°', 'Saldo Inicial', 'Amortización', 'Interés',
            'Seg. Desgravamen', 'Seg. Vehicular', 'Cuota Total', 'Saldo Final'
        ];

        const headerRow = sheet.getRow(tableRowStart);
        headerRow.eachCell((cell) => {
            cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: WHITE } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CORP_BLUE } };
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            cell.border = {
                right: { style: 'thin', color: { argb: WHITE } }
            };
        });

        // Filas de datos del cronograma
        cronograma.forEach((row, index) => {
            const dataRow = sheet.getRow(tableRowStart + 1 + index);
            dataRow.height = 20;
            dataRow.values = [
                row.mes,
                Number(row.saldo_inicial),
                Number(row.amortizacion),
                Number(row.interes),
                Number(row.seguro_desgravamen),
                Number(row.seguro_vehicular),
                Number(row.cuota),
                Number(row.saldo_final)
            ];

            const isEven = index % 2 === 0;
            const rowBg = isEven ? WHITE : CORP_LIGHT;

            dataRow.eachCell((cell, colNumber) => {
                cell.font = { name: 'Arial', size: 10, color: { argb: TEXT_MAIN } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
                cell.alignment = { vertical: 'middle', horizontal: 'right' };
                cell.border = {
                    bottom: { style: 'hair', color: { argb: HEADER_BG } },
                    right: { style: 'hair', color: { argb: WHITE } },
                    left: { style: 'hair', color: { argb: WHITE } }
                };
                
                if (colNumber === 1) {
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };
                    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: TEXT_MUTED } };
                } else {
                    cell.numFmt = monedaFormat;
                }
            });
        });

        // Línea divisoria de cierre del cronograma
        const closingRow = tableRowStart + 1 + cronograma.length;
        sheet.getRow(closingRow).height = 6;
        sheet.mergeCells(`A${closingRow}:H${closingRow}`);
        sheet.getCell(`A${closingRow}`).border = { top: { style: 'medium', color: { argb: CORP_BLUE } } };

        // Pie de página
        const footerRow = closingRow + 1;
        sheet.getRow(footerRow).height = 25;
        sheet.mergeCells(`A${footerRow}:H${footerRow}`);
        const footerCell = sheet.getCell(`A${footerRow}`);
        footerCell.value = `Documento generado automáticamente por AutoTech Finanzas  ·  ${new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })}  ·  Confidencial`;
        footerCell.font = { name: 'Arial', size: 8, italic: true, color: { argb: TEXT_MUTED } };
        footerCell.alignment = { vertical: 'middle', horizontal: 'center' };

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=AutoTech_Credito_${id}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error(error);
        return res.status(500).send('Error interno del servidor al exportar excel');
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
