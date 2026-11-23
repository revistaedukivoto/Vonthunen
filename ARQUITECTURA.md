# Arquitectura del simulador

## Base inspeccionada antes de V0.5

La aplicación es una web estática sin dependencias de ejecución, autenticación,
servidor ni base de datos. `index.html` carga scripts clásicos con `defer`; el
orden de carga define las dependencias entre módulos.

- `js/model.js` y `js/app.js`: funciones y controles del simulador económico
  original de Von Thünen (rentas, anillos, gráficos y escenarios).
- `js/map-algebra.js`: motor raster 100 × 100 de distancia, accesibilidad,
  costos, rentas y especialización económica; no depende del DOM.
- `js/map-interpretation.js`: interpretación del resultado raster.
- `js/territorial-app.js`: estado de interfaz raster, renderizado, consulta de
  celdas, carretera y comparación; publica los resultados para otros módulos.
- `js/territorial-regulation.js`: clases y reglas de uso, máscaras territoriales
  y evaluación de admisibilidad.
- `js/territorial-governance.js`: controles de ordenamiento territorial,
  importación/exportación de reglas y presentación de resultados normativos.
- `styles.css`: estilos y adaptación responsiva compartidos.

## Incorporación V0.5

`js/territorial-suitability-model.js` contiene el catálogo de criterios, las
superficies didácticas, los perfiles, la ponderación, las limitantes críticas,
la clasificación y los diagnósticos. No importa ni modifica el motor económico.
`js/territorial-suitability-app.js` consume el estado público del simulador
raster y del módulo normativo para dibujar capas MAT y comparar resultados.

Las capas predeterminadas son datos sintéticos ilustrativos, no observaciones
geográficas, mediciones de campo ni umbrales oficiales. La aptitud, la renta y
la admisibilidad son dimensiones distintas; el mapa de coincidencia las
compara, pero no altera los resultados de ninguno de los motores.

## Incorporación V0.6

`js/economic-land-valuation-model.js` agrega un motor puro para el Modelo de
Valoración Económica del Suelo (MVES). Recibe el índice continuo y la clase de
aptitud MAT, el raster económico actual, los perfiles editables y las reglas
normativas. No cambia `js/model.js`, `js/map-algebra.js` ni el resultado MAT.
`js/economic-land-valuation-app.js` provee los formularios, comparación por
celda, escenarios normativos, mapa de valor y análisis de sensibilidad.

### Cuentas y unidades

- Ingreso bruto anual: precio (COP por unidad) × producción anual vendible
  (unidades/ha/ciclo × ciclos/año × (1 − pérdidas) × respuesta de productividad).
- Respuesta de productividad: `piso + (1 − piso) × (MAT/100)^exponente`; si la
  clase MAT es N, la producción estimada de esa actividad es cero. El piso y el
  exponente son configurables por actividad, didácticos y no calibrados.
- Costos variables (COP/ha/ciclo) se multiplican por ciclos/año; los costos
  fijos, la remuneración de trabajo, capital y gestión, y el beneficio
  empresarial imputado se expresan en COP/ha/año. El beneficio empresarial
  imputado se muestra separado de otros factores no territoriales y ambos se
  descuentan una sola vez antes de obtener la renta residual del suelo.
- El costo de transporte se lee una vez desde `transportCosts` del raster
  económico vigente y se multiplica por el factor editable de conversión a COP
  (inicialmente 1 COP por unidad monetaria raster, supuesto didáctico). Se
  interpreta como costo anual y no se multiplica por ciclos. No se agrega otro
  costo base ni se vuelve a sumar la renta de localización de Von Thünen.
- Margen operativo = ingreso bruto − costos operativos − transporte.
  Renta residual del suelo = margen operativo − remuneración de factores no
  territoriales; es una renta anual en COP/ha/año.
- Capitalización: `V = R/r`, solo si la renta residual es positiva y la tasa es
  positiva. Flujo descontado: suma de ingresos menos costos proyectados con sus
  crecimientos separados, descontados por año, más valor terminal descontado.
  El terminal solo se incorpora si la renta proyectada del último año es
  positiva. Los resultados sin valor positivo se excluyen del mapa de valor.
- En el escenario potencial se evalúan todas las actividades, sin inferir
  autorización. En el escenario normativo solo se seleccionan usos principales
  o compatibles; usos condicionados quedan señalados como pendientes y los
  prohibidos no aparecen como aprovechamiento disponible.

Los valores iniciales de precios, rendimientos, costos, tasas y terminal son
supuestos ilustrativos sin fuentes de mercado. El resultado representa una
estimación económica hipotética por hectárea, no un avalúo comercial u oficial;
no valora construcciones, mejoras ni activos productivos y no interpreta una
restricción de uso como pérdida automática del valor del inmueble.

La comparación de mercado se deja deliberadamente fuera: no se inventan
transacciones comparables ni se declaran precios observados. Para ejecutar la
aplicación, abre `index.html` en un navegador moderno; no requiere instalación,
servidor, backend ni dependencias externas.

## Incorporación V0.7: cartografía municipal

La aplicación continúa siendo estática. `js/municipal-geometry.js` contiene
transformación Transversa de Mercator a MAGNA-SIRGAS / Origen-Nacional
(EPSG:9377), normalización de Polygon/MultiPolygon, validación estructural,
cálculo de área/perímetro proyectados, prueba punto-en-polígono y generación de
una máscara raster alineada en metros. Las filas raster se generan por
intersección scanline; las celdas con centro fuera del municipio son NODATA.
La resolución es configurable; el modo automático se aproxima a 10.000 celdas
interiores y se limita a 250.000 celdas y 2.000 filas/columnas para mantener
responsiva la aplicación. No se corrigen anillos topológicamente ambiguos: se
rechazan las geometrías estructuralmente inválidas en lugar de modificarlas.

`js/municipal-app.js` carga los atributos de los municipios bajo demanda y
mantiene una caché de geometrías seleccionadas. La fuente institucional es el
Marco Geoestadístico Nacional DANE 2025, capa Municipio (ID 317). En las
consultas validadas, el endpoint MapServer no devolvió la geometría solicitada;
por ello la aplicación consulta la capa gemela FeatureServer/317 para la
geometría. Los atributos se consultan primero en MapServer/317 y, si falla,
en FeatureServer/317. La carga de atributos se puede reintentar desde la
interfaz. Se filtran por `MPIO_TIPO = MUNICIPIO`, y la geometría se descarga
solo al seleccionar una entidad. La lista se deriva de `DPTO_CCDGO`,
`DPTO_CNMBRE`, `MPIO_CDPMP`, `MPIO_CNMBRE`, `MPIO_TIPO` y `MPIO_NANO`; no
existe una lista municipal codificada manualmente. El GeoJSON del usuario es
la alternativa cuando la red/servicio falla. Las consultas intentan `fetch`
con CORS y usan JSONP al mismo servicio oficial si el navegador bloquea la
lectura CORS; JSONP no puede resolver una desconexión de red o un bloqueo del
dominio. Se aceptan coordenadas en EPSG:4326, EPSG:4686 y EPSG:9377; los
GeoJSON sin CRS se interpretan según RFC 7946 como EPSG:4326.

El raster municipal usa la extensión proyectada, ancho/alto variables,
coordenadas métricas por celda y máscara propia. `js/map-algebra.js` conserva
el comportamiento demostrativo 100 × 100 por omisión y acepta, además,
dimensiones, coordenadas, máscara y punto de mercado para los cálculos
municipales. Distancia, costos, rentas y especialización se calculan con el
mismo motor económico y solo se agregan/reportan celdas válidas. Las
intersecciones de funciones de renta y los cruces con renta cero definen las
zonas económicas; sus bandas usan la máscara municipal y sus contornos se
recortan visualmente al polígono en el visor. Los anillos de distancia se
etiquetan por separado de las zonas de dominio económico.

No se localiza automáticamente la cabecera municipal: la capa municipal MGN
consultada no incluye su coordenada y el centroide no se usa como sustituto. El
usuario puede marcar el mercado en el mapa o ingresar coordenadas; el punto se
valida contra el polígono. El visor identifica explícitamente que no hay
rasters municipales de aptitud/MAT, insumos MVES con cobertura geográfica ni
cartografía POT cargada. Por ello esas capas no se rellenan con valores
sintéticos ni se presentan como resultados municipales; el análisis normativo
local permanece incompleto. La geometría MGN tampoco se presenta como límite
jurídico.

El visor permite consultar la celda, cambiar la capa y la actividad económica,
ajustar la resolución raster, ampliar la vista y graduar la transparencia de
la capa sobre el fondo neutro. El zoom y la transparencia son controles de
visualización: no alteran las coordenadas, la resolución ni los valores del
modelo.

La proyección implementa las fórmulas Transversa de Mercator para GRS80 con
parámetros EPSG:9377 (origen 4° N, 73° O, k₀ 0,9992, falsos Este/Norte
5.000.000/2.000.000 m). La capa fuente declara EPSG:4686. El cambio entre
MAGNA-SIRGAS geográfico (4686) y MAGNA-SIRGAS 2018 / Origen-Nacional (9377)
se calcula con la operación de proyección indicada; no se aplica una
transformación de datum adicional. Los resultados incluyen metadatos de fuente,
versión/año disponible, fecha, CRS, resolución, extensión, área, perímetro y
parámetros económicos.

## Incorporación V0.8: valorización económica y plusvalía

`js/land-valuation-plusvalia-model.js` implementa la comparación pura entre
dos resultados MVES: valores iniciales/posteriores, variaciones absolutas,
porcentajes protegidos frente a valores nulos o negativos, indicadores,
descomposición aproximada por factores y efecto didáctico de plusvalía.

`js/land-valuation-plusvalia-app.js` conecta el panel con el estado público
del MVES y del raster territorial. Permite capturar un escenario base, aplicar
intervenciones en los controles existentes, ejecutar la comparación,
consultar celdas, guardar localmente, duplicar, exportar JSON/CSV e importar
JSON. Los datos comerciales son opcionales y, si no existen referencias,
el módulo no presenta una participación exigible ni una liquidación oficial.

## Incorporación V1.0: mercado urbano poligonal y anillos rurales

`js/urban-market-rings-model.js` calcula distancia métrica al perímetro de
polígonos urbanos, máscara urbana/rural y bandas externas recortadas por la
extensión y resolución del municipio. No convierte automáticamente la
cabecera DANE en suelo urbano jurídico.

`js/urban-market-rings-app.js` agrega al visor municipal una carga GeoJSON
urbana/POT, una aproximación circular provisional basada en el mercado
marcado, controles de bandas y modalidad de distancia, accesos comerciales,
consulta de celdas e indicadores por superficie. El almacenamiento JSON
conserva geometría, supuestos, fuentes operativas y resultados. La
conectividad vial existente sigue siendo independiente de estos buffers:
sin topología explícita no se presume un camino hacia el mercado.

## Incorporación V1.1: distancias urbanas por red vial georreferenciada

El modo **Red vial efectiva** del módulo urbano acepta una FeatureCollection
GeoJSON con coordenadas métricas EPSG:9377 y geometrías LineString o
MultiLineString. Debe declarar `crs.properties.name: "EPSG:9377"`; las
coordenadas `[x, y]` representan metros. Rechaza redes sin CRS explícito o con
geometría, atributos o nodos inválidos. Las propiedades `speed`,
`circulationCost` y `penalty` son opcionales (60, 1 y 0 por defecto). Las redes
se guardan en la configuración JSON urbana; las configuraciones V1.0 siguen
siendo importables.

Cada tramo usa el factor didáctico
`60 / velocidad × costo de circulación × (1 + penalización)`. La distancia
final suma el acceso en línea recta desde la celda al tramo y la ruta de menor
costo sobre la red hasta un tramo que llega al polígono urbano o al área
provisional. La resolución es métrica; el costo de circulación y la
penalización son multiplicadores relativos, no costos monetarios comparables.
Solo las celdas con ruta quedan clasificadas en anillos y entran en la
distancia media de celdas alcanzables.

Los vértices consecutivos de un mismo LineString son transitables. Carreteras
distintas solo se conectan mediante nodos declarados en
`networkMetadata.nodes`, con `id`, `x`, `y` y `roadIds`; un cruce geométrico no
crea conectividad. Una carretera desconectada del área urbana no recibe una
distancia vial artificial. El control de modo vial permanece deshabilitado
hasta cargar una red válida.

El editor vial general continúa usando coordenadas de la cuadrícula
demostrativa 100 × 100. Sus exportaciones no tienen referencia espacial y no
se aplican al raster municipal; deben georreferenciarse primero y declarar
EPSG:9377 en el GeoJSON. No se asigna automáticamente la extensión municipal
a esas carreteras.

## Incorporación V1.1: catálogo vial nativo por municipio

`js/road-network-catalog.js` añade consulta automática al seleccionar un
municipio. El adaptador complementario inicial usa Overpass/OpenStreetMap
porque es una fuente pública verificable en formatos JSON/WGS84; no se declara
como red oficial ni se presenta como cobertura nacional completa. Se consulta
una caja ampliada 5 km alrededor del municipio para conservar conexiones
externas necesarias.

La consulta se convierte a EPSG:9377 y se conserva en caché local durante siete
días, organizada por código DIVIPOLA. Si falla la consulta, se conserva la
última versión almacenada y se informa su fecha. El panel muestra municipio,
fuente, actualización, longitud aproximada, segmentos, nodos compartidos,
cobertura y una atribución ODbL de OpenStreetMap.

Las vías se clasifican por categorías y velocidades iniciales derivadas de
`highway`, pero no reemplazan velocidades oficiales ni condición real. Los
segmentos mantienen identificadores OSM y etiquetas originales dentro de
`source_tags`. Las intersecciones se modelan como nodos compartidos solo
cuando varios segmentos usan el mismo identificador de nodo OSM; un cruce
geométrico sin nodo compartido no se conecta automáticamente.

El módulo proyecta la red EPSG:9377 sobre la cuadrícula municipal y la pasa al
álgebra de mapas, al visor municipal y al módulo urbano-rural. El área de
análisis sigue limitada al polígono municipal; la red de influencia puede
salirse de ese límite para calcular conectividad externa. El editor manual
sigue disponible como carga avanzada y no reemplaza la consulta automática.

Fuentes oficiales: se verificó el portal público de INVIAS y el portal del IGAC,
pero no se incorporó un servicio vial municipal comprobado ni un endpoint de
descarga cartográfica estable. No se inventaron URLs ni se afirmó cobertura
oficial. OpenStreetMap se utiliza únicamente como fuente complementaria sujeta
a ODbL y con advertencias visibles de cobertura incompleta.
