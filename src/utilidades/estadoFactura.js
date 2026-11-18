function obtenerFechaHoyBogota() {
  const partesFecha = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const valoresFecha = Object.fromEntries(partesFecha.map((parte) => [parte.type, parte.value]));
  return valoresFecha.year + "-" + valoresFecha.month + "-" + valoresFecha.day;
}

function calcularEstadoFactura(factura, fechaHoy = obtenerFechaHoyBogota()) {
  const totalAbonado = factura.pagos.reduce((suma, pago) => suma + pago.valor, 0);
  const saldoPendiente = Math.max(factura.valorTotal - totalAbonado, 0);
  const estadoPago = saldoPendiente === 0
    ? "pagada"
    : totalAbonado > 0
      ? "con_abonos"
      : "pendiente";

  let estadoVencimiento = "al_dia";
  if (saldoPendiente > 0 && factura.fechaVencimiento < fechaHoy) {
    estadoVencimiento = "vencida";
  } else if (saldoPendiente > 0 && factura.fechaVencimiento >= fechaHoy) {
    const diasParaVencer = (
      Date.parse(factura.fechaVencimiento + "T00:00:00Z") -
      Date.parse(fechaHoy + "T00:00:00Z")
    ) / 86400000;
    if (diasParaVencer <= 7) estadoVencimiento = "por_vencer";
  }

  return { totalAbonado, saldoPendiente, estadoPago, estadoVencimiento };
}

module.exports = { calcularEstadoFactura, obtenerFechaHoyBogota };
