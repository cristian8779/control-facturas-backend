const { randomUUID, createHash } = require("node:crypto");
const path = require("node:path");
const Factura = require("../modelos/Factura");
const { calcularEstadoFactura, obtenerFechaHoyBogota } = require("../utilidades/estadoFactura");
const { cloudinary } = require("../configuracion/cloudinary");
const { responderExito, responderError } = require("../utilidades/respuestasApi");

function errorNoEncontrado(respuesta, tipo) {
  return responderError(respuesta, {
    estado: 404,
    codigo: tipo === "pago" ? "PAGO_NO_ENCONTRADO" : tipo === "archivo" ? "ARCHIVO_NO_ENCONTRADO" : "FACTURA_NO_ENCONTRADA",
    mensaje: tipo === "pago" ? "No encontramos ese pago." : tipo === "archivo" ? "Esta factura todavía no tiene ese archivo." : "No encontramos esa factura. Puede que haya sido eliminada.",
  });
}

function prepararDatosAdjunto(archivo, resultadoCloudinary) {
  return {
    nombreArchivo: path.basename(archivo.originalname).slice(0, 180),
    tipoContenido: archivo.mimetype,
    tamano: resultadoCloudinary.bytes || archivo.size,
    idPublico: resultadoCloudinary.public_id,
    formato: resultadoCloudinary.format || (archivo.mimetype === "application/pdf" ? "pdf" : archivo.mimetype === "image/png" ? "png" : archivo.mimetype === "image/webp" ? "webp" : "jpg"),
    tipoRecurso: resultadoCloudinary.resource_type || "image",
  };
}

function presentarComprobante(adjunto, url) {
  if (!adjunto) return null;
  return {
    id: obtenerIdAdjunto(adjunto),
    nombreArchivo: adjunto.nombreArchivo,
    tipoContenido: adjunto.tipoContenido,
    tamano: adjunto.tamano,
    url,
  };
}

function obtenerIdAdjunto(adjunto) {
  return createHash("sha256").update(adjunto.idPublico).digest("hex").slice(0, 32);
}

function presentarPago(pago, idFactura) {
  const idPago = pago._id.toString();
  return {
    id: idPago,
    valor: pago.valor,
    fechaPago: pago.fechaPago,
    metodoPago: pago.metodoPago,
    referencia: pago.referencia,
    observaciones: pago.observaciones,
    comprobante: presentarComprobante(
      pago.comprobante,
      pago.comprobante ? "/api/facturas/" + idFactura + "/pagos/" + idPago + "/comprobante" : null
    ),
  };
}

function presentarFactura(factura) {
  const datos = factura.toObject ? factura.toObject() : factura;
  const idFactura = datos._id.toString();
  const resumen = calcularEstadoFactura(datos);
  const adjuntosFactura = (datos.adjuntosFactura || []).map((adjunto) =>
    presentarComprobante(
      adjunto,
      "/api/facturas/" + idFactura + "/adjuntos/" + obtenerIdAdjunto(adjunto)
    )
  );
  if (
    datos.adjuntoFactura &&
    !adjuntosFactura.some((adjunto) => adjunto.id === obtenerIdAdjunto(datos.adjuntoFactura))
  ) {
    adjuntosFactura.unshift(
      presentarComprobante(
        datos.adjuntoFactura,
        "/api/facturas/" + idFactura + "/adjuntos/" + obtenerIdAdjunto(datos.adjuntoFactura)
      )
    );
  }
  return {
    id: idFactura,
    comercio: datos.comercio,
    valorTotal: datos.valorTotal,
    fechaLlegada: datos.fechaLlegada,
    fechaVencimiento: datos.fechaVencimiento,
    numeroFactura: datos.numeroFactura,
    observaciones: datos.observaciones,
    totalAbonado: resumen.totalAbonado,
    saldoPendiente: resumen.saldoPendiente,
    estadoPago: resumen.estadoPago,
    estadoVencimiento: resumen.estadoVencimiento,
    adjuntosFactura,
    // Alias para conservar compatibilidad con clientes anteriores.
    adjuntoFactura: adjuntosFactura[0] || null,
    pagos: datos.pagos.map((pago) => presentarPago(pago, idFactura)),
    fechaCreacion: datos.fechaCreacion,
    fechaActualizacion: datos.fechaActualizacion,
  };
}

function obtenerCamposFactura(cuerpo) {
  const camposPermitidos = [
    "comercio",
    "valorTotal",
    "fechaLlegada",
    "fechaVencimiento",
    "numeroFactura",
    "observaciones",
  ];
  return Object.fromEntries(
    camposPermitidos
      .filter((campo) => cuerpo[campo] !== undefined)
      .map((campo) => [campo, cuerpo[campo]])
  );
}

function subirArchivoCloudinary(archivo, carpeta) {
  const idPublico = randomUUID();
  const opciones = {
    folder: "control-facturas/" + carpeta,
    public_id: idPublico,
    resource_type: "image",
    type: "authenticated",
    use_filename: false,
    overwrite: false,
  };
  if (archivo.mimetype.startsWith("image/")) {
    opciones.transformation = [{ width: 2000, height: 2000, crop: "limit", quality: "auto:good" }];
  }
  const enviar = (opcionesSubida) => new Promise((resolver, rechazar) => {
    const flujoSubida = cloudinary.uploader.upload_stream(
      opcionesSubida,
      (fallo, resultado) => fallo ? rechazar(fallo) : resolver(resultado)
    );
    flujoSubida.end(archivo.buffer);
  });

  if (archivo.mimetype !== "application/pdf") return enviar(opciones);

  // Si la cuenta tiene optimización de PDF habilitada, comprime antes de guardar.
  // Si Cloudinary no ofrece esa función en la cuenta, conserva y guarda el PDF original.
  return enviar({ ...opciones, transformation: [{ quality: "auto" }], async: true })
    .catch((fallo) => {
      console.warn("No se pudo optimizar el PDF; se guardará el original.");
      return enviar({ ...opciones, overwrite: true });
    });
}

async function eliminarArchivoCloudinary(adjunto) {
  if (!adjunto || !adjunto.idPublico) return;
  await cloudinary.uploader.destroy(adjunto.idPublico, {
    resource_type: adjunto.tipoRecurso || "image",
    type: "authenticated",
    invalidate: true,
  });
}

function crearUrlTemporal(adjunto) {
  return cloudinary.utils.private_download_url(
    adjunto.idPublico,
    adjunto.formato,
    {
      resource_type: adjunto.tipoRecurso || "image",
      type: "authenticated",
      expires_at: Math.floor(Date.now() / 1000) + 300,
    }
  );
}

function escaparExpresionRegular(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function esFechaIsoValida(fecha) {
  if (typeof fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const fechaConvertida = new Date(fecha + "T00:00:00.000Z");
  return !Number.isNaN(fechaConvertida.valueOf()) && fechaConvertida.toISOString().slice(0, 10) === fecha;
}

function leerParametroTexto(consulta, nombre, maximo) {
  const valor = consulta[nombre];
  if (valor === undefined) return { valor: "", valido: true };
  if (typeof valor !== "string") return { valor: "", valido: false };
  const texto = valor.trim();
  return { valor: texto, valido: texto.length <= maximo };
}

function leerParametroValor(consulta, nombre) {
  const valor = consulta[nombre];
  if (valor === undefined || valor === "") return { valor: null, valido: true };
  if (typeof valor !== "string" || !/^\d+$/.test(valor)) return { valor: null, valido: false };
  const numero = Number(valor);
  return { valor: numero, valido: Number.isSafeInteger(numero) };
}

async function listarFacturas(solicitud, respuesta) {
  const consulta = solicitud.query;
  const busqueda = leerParametroTexto(consulta, "busqueda", 120);
  const estadoPago = leerParametroTexto(consulta, "estadoPago", 20);
  const estadoVencimiento = leerParametroTexto(consulta, "estadoVencimiento", 20);
  const desde = leerParametroTexto(consulta, "desde", 10);
  const hasta = leerParametroTexto(consulta, "hasta", 10);
  const valorDesde = leerParametroValor(consulta, "valorDesde");
  const valorHasta = leerParametroValor(consulta, "valorHasta");

  const fechasValidas =
    (!desde.valor || esFechaIsoValida(desde.valor)) &&
    (!hasta.valor || esFechaIsoValida(hasta.valor)) &&
    (!desde.valor || !hasta.valor || desde.valor <= hasta.valor);
  const estadosValidos =
    (!estadoPago.valor || ["pendiente", "con_abonos", "pagada"].includes(estadoPago.valor)) &&
    (!estadoVencimiento.valor || ["al_dia", "por_vencer", "vencida"].includes(estadoVencimiento.valor));
  const valoresValidos =
    valorDesde.valido && valorHasta.valido &&
    (valorDesde.valor === null || valorHasta.valor === null || valorDesde.valor <= valorHasta.valor);

  if (!busqueda.valido || !estadoPago.valido || !estadoVencimiento.valido ||
      !desde.valido || !hasta.valido || !valorDesde.valido || !valorHasta.valido ||
      !fechasValidas || !estadosValidos || !valoresValidos) {
    return responderError(respuesta, {
      estado: 400,
      codigo: "FILTROS_NO_VALIDOS",
      mensaje: "No pudimos aplicar esos filtros. Revisa los datos e inténtalo de nuevo.",
      detalles: {
        busqueda: "La búsqueda debe tener máximo 120 caracteres.",
        fechas: "Usa fechas válidas con formato AAAA-MM-DD y revisa que el inicio no sea posterior al final.",
        valores: "Usa valores enteros positivos y revisa que el mínimo no supere el máximo.",
        estados: "Selecciona un estado de factura disponible.",
      },
    });
  }

  const filtrosBase = {};
  if (busqueda.valor) {
    const expresion = new RegExp(escaparExpresionRegular(busqueda.valor), "i");
    filtrosBase.$or = [
      { comercio: expresion },
      { numeroFactura: expresion },
    ];
  }
  if (desde.valor || hasta.valor) {
    filtrosBase.fechaVencimiento = {};
    if (desde.valor) filtrosBase.fechaVencimiento.$gte = desde.valor;
    if (hasta.valor) filtrosBase.fechaVencimiento.$lte = hasta.valor;
  }
  if (valorDesde.valor !== null || valorHasta.valor !== null) {
    filtrosBase.valorTotal = {};
    if (valorDesde.valor !== null) filtrosBase.valorTotal.$gte = valorDesde.valor;
    if (valorHasta.valor !== null) filtrosBase.valorTotal.$lte = valorHasta.valor;
  }

  const fechaHoy = obtenerFechaHoyBogota();
  const fechaLimiteProxima = new Date(
    Date.parse(fechaHoy + "T00:00:00.000Z") + 7 * 86400000
  ).toISOString().slice(0, 10);
  const filtroEstado = {};
  if (estadoPago.valor) filtroEstado.estadoPago = estadoPago.valor;
  if (estadoVencimiento.valor) filtroEstado.estadoVencimiento = estadoVencimiento.valor;

  const [resultado = { facturas: [], cantidad: [] }] = await Factura.aggregate([
    ...(Object.keys(filtrosBase).length ? [{ $match: filtrosBase }] : []),
    {
      $addFields: {
        totalAbonado: {
          $sum: {
            $map: {
              input: { $ifNull: ["$pagos", []] },
              as: "pago",
              in: "$$pago.valor",
            },
          },
        },
      },
    },
    {
      $addFields: {
        saldoPendiente: {
          $max: [{ $subtract: ["$valorTotal", "$totalAbonado"] }, 0],
        },
      },
    },
    {
      $addFields: {
        estadoPago: {
          $switch: {
            branches: [
              { case: { $eq: ["$saldoPendiente", 0] }, then: "pagada" },
              { case: { $gt: ["$totalAbonado", 0] }, then: "con_abonos" },
            ],
            default: "pendiente",
          },
        },
        estadoVencimiento: {
          $switch: {
            branches: [
              { case: { $eq: ["$saldoPendiente", 0] }, then: "al_dia" },
              { case: { $lt: ["$fechaVencimiento", fechaHoy] }, then: "vencida" },
              { case: { $lte: ["$fechaVencimiento", fechaLimiteProxima] }, then: "por_vencer" },
            ],
            default: "al_dia",
          },
        },
      },
    },
    ...(Object.keys(filtroEstado).length ? [{ $match: filtroEstado }] : []),
    {
      $facet: {
        facturas: [{ $sort: { fechaVencimiento: 1 } }, { $limit: 500 }],
        cantidad: [{ $count: "total" }],
      },
    },
  ]);

  const facturas = resultado.facturas.map(presentarFactura);
  const cantidad = resultado.cantidad[0]?.total || 0;
  responderExito(respuesta, {
    mensaje: "Facturas consultadas correctamente.",
    datos: { facturas, cantidad },
  });
}

async function obtenerFactura(solicitud, respuesta) {
  const factura = await Factura.findById(solicitud.params.idFactura);
  if (!factura) return errorNoEncontrado(respuesta, "factura");
  responderExito(respuesta, { mensaje: "Factura consultada correctamente.", datos: presentarFactura(factura) });
}

async function crearFactura(solicitud, respuesta) {
  const factura = await Factura.create(obtenerCamposFactura(solicitud.body));
  responderExito(respuesta, { estado: 201, mensaje: "Factura guardada correctamente.", datos: presentarFactura(factura) });
}

async function actualizarFactura(solicitud, respuesta) {
  const factura = await Factura.findById(solicitud.params.idFactura);
  if (!factura) return errorNoEncontrado(respuesta, "factura");
  const cambios = obtenerCamposFactura(solicitud.body);
  if (Object.keys(cambios).length === 0) {
    return responderError(respuesta, {
      estado: 400,
      codigo: "SIN_CAMBIOS_PARA_ACTUALIZAR",
      mensaje: "No recibimos datos para actualizar la factura.",
      detalles: { factura: "Modifica al menos un campo e inténtalo de nuevo." },
    });
  }

  for (const campo of ["fechaLlegada", "fechaVencimiento"]) {
    if (cambios[campo] !== undefined && !esFechaIsoValida(cambios[campo])) {
      return responderError(respuesta, {
        estado: 400,
        codigo: "FECHA_FACTURA_NO_VALIDA",
        mensaje: "Revisa las fechas de la factura.",
        detalles: { [campo]: "Selecciona una fecha válida en formato AAAA-MM-DD." },
      });
    }
  }

  const fechaLlegada = cambios.fechaLlegada || factura.fechaLlegada;
  const fechaVencimiento = cambios.fechaVencimiento || factura.fechaVencimiento;
  if (fechaLlegada > fechaVencimiento) {
    return responderError(respuesta, {
      estado: 400,
      codigo: "FECHAS_FACTURA_INCOHERENTES",
      mensaje: "La fecha de vencimiento no puede ser anterior a la fecha de llegada.",
      detalles: { fechaVencimiento: "Elige un vencimiento igual o posterior a la llegada." },
    });
  }

  const totalAbonado = factura.pagos.reduce((suma, pago) => suma + pago.valor, 0);
  if (cambios.valorTotal !== undefined && Number(cambios.valorTotal) < totalAbonado) {
    return responderError(respuesta, {
      estado: 400,
      codigo: "TOTAL_MENOR_QUE_ABONOS",
      mensaje: "El valor total no puede ser menor que lo que ya se ha abonado.",
      detalles: { valorTotal: `Ya hay ${totalAbonado} pesos registrados en pagos.` },
    });
  }

  Object.assign(factura, cambios);
  await factura.save();
  responderExito(respuesta, { mensaje: "Factura actualizada correctamente.", datos: presentarFactura(factura) });
}

async function registrarPago(solicitud, respuesta) {
  const factura = await Factura.findById(solicitud.params.idFactura);
  if (!factura) return errorNoEncontrado(respuesta, "factura");

  const valor = Number(solicitud.body.valor);
  const totalAbonado = factura.pagos.reduce((suma, pago) => suma + pago.valor, 0);
  const saldoPendiente = factura.valorTotal - totalAbonado;
  if (!Number.isSafeInteger(valor) || valor <= 0) {
    return responderError(respuesta, { estado: 400, codigo: "VALOR_PAGO_NO_VALIDO", mensaje: "Escribe un valor de abono mayor que cero, en pesos enteros.", detalles: { valor: "Usa un número entero; no incluyas puntos ni comas." } });
  }
  if (valor > saldoPendiente) {
    return responderError(respuesta, { estado: 400, codigo: "PAGO_SUPERA_SALDO", mensaje: "El abono no puede ser mayor que el saldo pendiente.", detalles: { valor: "Revisa el saldo de la factura antes de guardar." } });
  }

  const fechaPago = solicitud.body.fechaPago ? new Date(solicitud.body.fechaPago) : new Date();
  if (Number.isNaN(fechaPago.valueOf())) {
    return responderError(respuesta, { estado: 400, codigo: "FECHA_PAGO_NO_VALIDA", mensaje: "La fecha del pago no es válida.", detalles: { fechaPago: "Usa una fecha válida." } });
  }
  const metodosPermitidos = ["efectivo", "transferencia", "tarjeta", "otro"];
  const metodoPago = solicitud.body.metodoPago || "otro";
  if (!metodosPermitidos.includes(metodoPago)) {
    return responderError(respuesta, { estado: 400, codigo: "METODO_PAGO_NO_VALIDO", mensaje: "Selecciona un método de pago disponible.", detalles: { metodoPago: "Opciones: efectivo, transferencia, tarjeta u otro." } });
  }

  factura.pagos.push({
    valor,
    fechaPago,
    metodoPago,
    referencia: String(solicitud.body.referencia || "").trim(),
    observaciones: String(solicitud.body.observaciones || "").trim(),
  });
  await factura.save();
  responderExito(respuesta, { estado: 201, mensaje: "Pago registrado correctamente.", datos: presentarFactura(factura) });
}

async function eliminarPago(solicitud, respuesta) {
  const factura = await Factura.findById(solicitud.params.idFactura);
  if (!factura) return errorNoEncontrado(respuesta, "factura");
  const pago = factura.pagos.id(solicitud.params.idPago);
  if (!pago) return errorNoEncontrado(respuesta, "pago");
  if (pago.comprobante) await eliminarArchivoCloudinary(pago.comprobante);
  pago.deleteOne();
  await factura.save();
  responderExito(respuesta, { mensaje: "Pago eliminado correctamente.", datos: presentarFactura(factura) });
}

async function guardarAdjuntoFactura(solicitud, respuesta) {
  const factura = await Factura.findById(solicitud.params.idFactura);
  if (!factura) return errorNoEncontrado(respuesta, "factura");
  const archivos = solicitud.files?.length
    ? solicitud.files
    : solicitud.file
      ? [solicitud.file]
      : [];
  if (archivos.length === 0) return responderError(respuesta, { estado: 400, codigo: "ARCHIVO_REQUERIDO", mensaje: "Selecciona una o más páginas de la factura para adjuntarlas." });

  const cantidadActual = factura.adjuntosFactura.length + (factura.adjuntoFactura ? 1 : 0);
  if (cantidadActual + archivos.length > 30) {
    return responderError(respuesta, { estado: 400, codigo: "LIMITE_ADJUNTOS_FACTURA", mensaje: "Una factura puede tener hasta 30 páginas o archivos adjuntos." });
  }

  const adjuntosSubidos = [];
  try {
    for (const archivo of archivos) {
      const resultado = await subirArchivoCloudinary(archivo, "facturas");
      adjuntosSubidos.push(prepararDatosAdjunto(archivo, resultado));
    }
    factura.adjuntosFactura.push(...adjuntosSubidos);
    await factura.save();
  } catch (fallo) {
    await Promise.all(
      adjuntosSubidos.map((adjunto) => eliminarArchivoCloudinary(adjunto).catch(() => {}))
    );
    throw fallo;
  }
  responderExito(respuesta, { estado: 201, mensaje: "Páginas adjuntadas a la factura correctamente.", datos: presentarFactura(factura) });
}

async function obtenerAdjuntoFactura(solicitud, respuesta) {
  const factura = await Factura.findById(solicitud.params.idFactura);
  if (!factura) return errorNoEncontrado(respuesta, "factura");
  const adjunto = factura.adjuntosFactura[0] || factura.adjuntoFactura;
  return redirigirAlAdjunto(adjunto, respuesta);
}

async function obtenerAdjuntoFacturaPorId(solicitud, respuesta) {
  const factura = await Factura.findById(solicitud.params.idFactura);
  if (!factura) return errorNoEncontrado(respuesta, "factura");
  const adjuntos = [...factura.adjuntosFactura];
  if (factura.adjuntoFactura) adjuntos.push(factura.adjuntoFactura);
  const adjunto = adjuntos.find((archivo) => obtenerIdAdjunto(archivo) === solicitud.params.idAdjunto);
  return redirigirAlAdjunto(adjunto, respuesta);
}

async function eliminarAdjuntoFactura(solicitud, respuesta) {
  const factura = await Factura.findById(solicitud.params.idFactura);
  if (!factura) return errorNoEncontrado(respuesta, "factura");
  const idAdjunto = solicitud.params.idAdjunto;
  const indice = factura.adjuntosFactura.findIndex((archivo) => obtenerIdAdjunto(archivo) === idAdjunto);
  let archivoEliminado;
  if (indice !== -1) {
    archivoEliminado = factura.adjuntosFactura[indice].toObject();
    factura.adjuntosFactura.splice(indice, 1);
  } else if (factura.adjuntoFactura && obtenerIdAdjunto(factura.adjuntoFactura) === idAdjunto) {
    archivoEliminado = factura.adjuntoFactura.toObject();
    factura.adjuntoFactura = null;
  } else {
    return errorNoEncontrado(respuesta, "archivo");
  }
  await factura.save();
  await eliminarArchivoCloudinary(archivoEliminado).catch((fallo) => {
    console.error("No se pudo limpiar un archivo eliminado de Cloudinary:", fallo);
  });
  responderExito(respuesta, { mensaje: "Archivo eliminado correctamente.", datos: presentarFactura(factura) });
}

async function guardarComprobantePago(solicitud, respuesta) {
  const factura = await Factura.findById(solicitud.params.idFactura);
  if (!factura) return errorNoEncontrado(respuesta, "factura");
  const pago = factura.pagos.id(solicitud.params.idPago);
  if (!pago) return errorNoEncontrado(respuesta, "pago");
  if (!solicitud.file) return responderError(respuesta, { estado: 400, codigo: "ARCHIVO_REQUERIDO", mensaje: "Selecciona la foto o el PDF del comprobante de pago para adjuntarlo." });

  const resultado = await subirArchivoCloudinary(solicitud.file, "comprobantes");
  const adjuntoAnterior = pago.comprobante;
  pago.comprobante = prepararDatosAdjunto(solicitud.file, resultado);
  try {
    await factura.save();
  } catch (fallo) {
    await eliminarArchivoCloudinary(pago.comprobante).catch(() => {});
    throw fallo;
  }
  if (adjuntoAnterior) await eliminarArchivoCloudinary(adjuntoAnterior);
  responderExito(respuesta, { estado: 201, mensaje: "Comprobante de pago adjuntado correctamente.", datos: presentarFactura(factura) });
}

async function redirigirAlAdjunto(adjunto, respuesta) {
  if (!adjunto) return errorNoEncontrado(respuesta, "archivo");
  respuesta.redirect(302, crearUrlTemporal(adjunto));
}

async function obtenerComprobantePago(solicitud, respuesta) {
  const factura = await Factura.findById(solicitud.params.idFactura);
  if (!factura) return errorNoEncontrado(respuesta, "factura");
  const pago = factura.pagos.id(solicitud.params.idPago);
  if (!pago) return errorNoEncontrado(respuesta, "pago");
  return redirigirAlAdjunto(pago.comprobante, respuesta);
}

async function eliminarFactura(solicitud, respuesta) {
  const factura = await Factura.findById(solicitud.params.idFactura);
  if (!factura) return errorNoEncontrado(respuesta, "factura");

  const adjuntos = [];
  if (factura.adjuntoFactura) adjuntos.push(factura.adjuntoFactura);
  adjuntos.push(...factura.adjuntosFactura);
  for (const pago of factura.pagos) {
    if (pago.comprobante) adjuntos.push(pago.comprobante);
  }
  await Promise.all(adjuntos.map(eliminarArchivoCloudinary));
  await factura.deleteOne();
  responderExito(respuesta, { mensaje: "Factura y sus archivos eliminados correctamente." });
}

module.exports = {
  listarFacturas,
  obtenerFactura,
  crearFactura,
  actualizarFactura,
  registrarPago,
  eliminarPago,
  guardarAdjuntoFactura,
  obtenerAdjuntoFacturaPorId,
  eliminarAdjuntoFactura,
  guardarComprobantePago,
  obtenerAdjuntoFactura,
  obtenerComprobantePago,
  eliminarFactura,
};

