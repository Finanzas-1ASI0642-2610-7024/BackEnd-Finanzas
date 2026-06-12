const { calcularTIR, calcularVAN } = require('./src/utils/financialMath.js');

const reqBody = {
    precio_vehiculo: 20000, cuota_inicial: 4000, cuota_final_porcentaje: 30,
    tipo_tasa: 'TEA', tasa_interes: 0.15, capitalizacion: 'Mensual',
    plazo_meses: 36, tipo_gracia: 'Ninguno', periodos_gracia: 0,
    seguro_desgravamen: 0.0005, seguro_vehicular_anual: 0.05, comisiones: 150
};

const { 
    precio_vehiculo, cuota_inicial, cuota_final_porcentaje, 
    tipo_tasa, tasa_interes, capitalizacion, plazo_meses, 
    tipo_gracia, periodos_gracia, 
    seguro_desgravamen, seguro_vehicular_anual, comisiones
} = reqBody;

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

const TIR_mensual = calcularTIR(flujos_caja); 
const TCEA = Math.pow(1 + TIR_mensual, 12) - 1;

console.log(JSON.stringify({ 
    TIR_mensual, TCEA, 
    first_month: cronograma[0], 
    last_month: cronograma[cronograma.length - 1],
    VP_Balloon, saldo_amortizable
}, null, 2));
