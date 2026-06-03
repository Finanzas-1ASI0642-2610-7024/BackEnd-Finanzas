// Implementación del método de Newton-Raphson para calcular la TIR
function calcularTIR(flujos_caja, guess = 0.1) {
    const maxIterations = 1000;
    const precision = 1e-7;
    let rate = guess;

    for (let i = 0; i < maxIterations; i++) {
        let npv = 0;
        let derivative = 0;

        for (let t = 0; t < flujos_caja.length; t++) {
            npv += flujos_caja[t] / Math.pow(1 + rate, t);
            if (t > 0) {
                derivative -= (t * flujos_caja[t]) / Math.pow(1 + rate, t + 1);
            }
        }

        const nextRate = rate - npv / derivative;

        if (Math.abs(nextRate - rate) < precision) {
            return nextRate;
        }
        rate = nextRate;
    }
    return rate; // Aproximación si no converge
}

function calcularVAN(tasa_descuento, flujos_caja) {
    let van = 0;
    for (let t = 0; t < flujos_caja.length; t++) {
        van += flujos_caja[t] / Math.pow(1 + tasa_descuento, t);
    }
    return van;
}

module.exports = {
    calcularTIR,
    calcularVAN
};
