# Backend de control de facturas

API Node.js organizada por capas. MongoDB Atlas guarda las facturas y Cloudinary guarda la factura escaneada y los comprobantes de pago. Los archivos se cargan como recursos autenticados y la API genera enlaces temporales para abrirlos.

## Estructura

- server.js: inicia el servidor.
- src/aplicacion.js: configura Express y monta las rutas.
- src/configuracion: conecta MongoDB Atlas y Cloudinary.
- src/modelos/Factura.js: define facturas y abonos.
- src/controladores/controladorFacturas.js: contiene la lógica.
- src/rutas/rutasFacturas.js: declara las rutas HTTP.
- src/intermediarios: recibe archivos y procesa errores.
- src/utilidades/estadoFactura.js: calcula saldos y estados.

## Configuración

El archivo .env local contiene las credenciales y está excluido de Git. No lo compartas ni lo subas al repositorio. .env.example muestra los nombres requeridos sin credenciales reales.

Desde esta carpeta, instala dependencias con npm install y ejecuta npm run dev. Para conectar a Atlas, el proyecto debe permitir la IP pública del computador y el usuario de base de datos debe tener permisos sobre admin_db.

## Datos de factura

Las fechas usan AAAA-MM-DD. El valor se maneja como pesos colombianos enteros.

Ejemplo para crear una factura:
{"comercio":"Distribuidora Ejemplo","valorTotal":1000000,"fechaLlegada":"2026-10-13","fechaVencimiento":"2026-10-20","numeroFactura":"F-123","observaciones":""}

Cada factura admite hasta 30 páginas o documentos adjuntos; se pueden cargar hasta tres por envío. Los pagos se registran aparte y cada pago admite un comprobante.

Ejemplo para registrar un abono:
{"valor":250000,"fechaPago":"2026-10-13","metodoPago":"transferencia","referencia":"Transferencia 123","observaciones":""}

El comprobante se carga después del abono. Los métodos permitidos son efectivo, transferencia, tarjeta y otro. El saldo pendiente se calcula restando los abonos al valor total.

- estadoPago: pendiente, con_abonos o pagada.
- estadoVencimiento: al_dia, por_vencer o vencida.
- Por vencer significa que faltan hasta 7 días para la fecha de pago.

## Rutas

- GET /api/salud
- GET /api/facturas?estadoPago=con_abonos&estadoVencimiento=por_vencer&busqueda=tienda&desde=2026-10-01&hasta=2026-10-31&valorDesde=100000&valorHasta=500000
- POST /api/facturas
- GET /api/facturas/:idFactura
- PUT /api/facturas/:idFactura
- DELETE /api/facturas/:idFactura
- POST /api/facturas/:idFactura/pagos
- DELETE /api/facturas/:idFactura/pagos/:idPago
- POST /api/facturas/:idFactura/adjunto
- GET /api/facturas/:idFactura/adjunto
- GET /api/facturas/:idFactura/adjuntos/:idAdjunto
- DELETE /api/facturas/:idFactura/adjuntos/:idAdjunto
- POST /api/facturas/:idFactura/pagos/:idPago/comprobante
- GET /api/facturas/:idFactura/pagos/:idPago/comprobante

Las cargas usan multipart/form-data con el campo archivo. Se aceptan JPG, PNG, WEBP y PDF de hasta 10 MB.

## Respuestas de la API

Las respuestas JSON exitosas usan el mismo formato. La información principal está dentro de `datos` y el mensaje está pensado para mostrarse en la app:

```json
{
  "correcto": true,
  "mensaje": "Factura guardada correctamente.",
  "datos": {
    "id": "identificador-de-la-factura",
    "comercio": "Distribuidora Ejemplo"
  }
}
```

Los errores incluyen un `codigo` estable para que Flutter pueda decidir qué hacer sin depender del texto del mensaje. Si hay campos por corregir, se envían en `detalles`:

```json
{
  "correcto": false,
  "codigo": "DATOS_NO_VALIDOS",
  "mensaje": "Revisa los datos marcados y vuelve a intentarlo.",
  "detalles": {
    "fechaVencimiento": "La fecha de vencimiento debe tener formato AAAA-MM-DD."
  }
}
```

La ruta `GET /api/salud` también sigue el formato común. Las rutas de descarga de adjuntos redirigen a un enlace temporal seguro y por eso no devuelven JSON.

### Filtros del listado

Todos los parámetros de `GET /api/facturas` son opcionales y se pueden combinar:

- `busqueda`: busca texto parcial, sin distinguir mayúsculas, en comercio o número de factura (máximo 120 caracteres).
- `estadoPago`: `pendiente`, `con_abonos` o `pagada`.
- `estadoVencimiento`: `al_dia`, `por_vencer` o `vencida`.
- `desde` y `hasta`: rango inclusivo de fechas de vencimiento con formato `AAAA-MM-DD`.
- `valorDesde` y `valorHasta`: rango inclusivo del valor total en pesos enteros.

MongoDB aplica los filtros y calcula los estados usando los abonos y la fecha de Colombia. La respuesta incluye `cantidad` con el total de coincidencias y devuelve como máximo 500 facturas ordenadas por vencimiento.
