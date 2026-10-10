The Coming Wave - XML de flujos de ataque

Cada XML contiene:
- source/pages: páginas de TCW - TABLAS DE COMBATE usadas como base.
- workflow/stage: etapas en orden.
- question: preguntas secuenciales.
- effect type="modifier": modificadores numéricos.
- effect type="rule": restricciones o efectos no numéricos.
- formula/specialRules: reglas de combinación.
- tableReference/finalTableReference: tabla a mostrar al final.

Nota importante:
En dos lugares de las tablas el valor "Modificador de guiado" aparece como +?.
El XML no inventa ese valor: lo solicita como dato, para que el motor lo obtenga
del procedimiento de designación/guía que se implemente en otra fuente de datos.


ICONOS
------
Los XML incluyen referencias <iconRef ref="..."/> allí donde las tablas/leyendas
aportadas muestran un símbolo gráfico representativo.

Los PNG están en /icons y el catálogo completo está incluido en cada XML mediante
<iconCatalog>, además de figurar en index.xml.

Ejemplo:
  <option value="supersonic" label="Supersónico">
    <effect .../>
    <iconRef ref="munition_supersonic" role="representative"/>
  </option>

La aplicación puede resolver el icono buscando el id en <iconCatalog> y cargando su
atributo src. No se ha inventado ningún icono para modificadores puramente textuales
como "atacante no detectado", valores electrónicos o distancia: en esos casos no se
añade iconRef porque la documentación aportada no muestra un icono específico.
