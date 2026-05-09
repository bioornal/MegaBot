# Simulaciones Test Bot — Impasto Chris

Copiar y pegar cada línea en WhatsApp, una por una.

---

## SIMULACIÓN 1: Cambios de opinión + sinónimos + productos inexistentes

```
Hola buenas, están abiertos?
Quiero armar una docena y media de empanadas combinadas
6 de carne, 4 de pollo y 4 de roquefort
Si, agregame una burger completa
Na, me arrepentí. Sacá las de roquefort y la burger. Y las de carne cambiame a 8
Dale y mandate una fugazzeta
No más eso. Ah y no, espera, también un lomito completo
No, eso es todo. Cuánto da?
Ah no, pensaba que los lomitos eran más baratos. Sacalo
Retiro en local
Marcos
```

---

## SIMULACIÓN 2: Delivery + comprobante incorrecto + cambio de pago

```
Hola, quería pedir unas pizzas
2 de muzza y 1 napolitana
Si, y 6 empanadas de carne
Dale, eso es todo
Es por delivery a Belgrano 500
Transferencia
Lucía
```
*(En este punto enviar comprobante por $70.000)*
```
Ah cierto, me confundí. Ahí va el resto
```
*(Enviar comprobante por $4.000 a otra cuenta)*
```
Perdón, ahí va bien
```
*(Enviar comprobante por $74.000 a cuenta correcta)*

---

## SIMULACIÓN 3: Preguntas trampa + mitad y mitad + producto inexistente

```
Hola, tenés pizza para celiacos?
Y para intolerantes a la lactosa?
Ok igual quiero pedir. Qué pizzas tienen?
Me puedo armar una mitad y mitad de fugazzeta con roquefort?
Bueno mandate una fugazzeta y una roquefort entonces
Si, y también quiero una de ananá con jamón
No, dale la fugazzeta y roquefort nomás
Es por delivery a Mitre 800
Pedro
Efectivo
```

---

## SIMULACIÓN 4: Pedido grande + cambios a último momento + pregunta por precio de docena

```
Buenas! Quiero hacer un pedido grande para un cumpleaños
Quiero 2 docenas de empanadas combinadas y 4 pizzas
Docena 1: 6 carne, 6 pollo. Docena 2: 6 roquefort, 6 caprese. Pizzas: 2 muzza, 1 napolitana, 1 fugazzeta
Dale, ah y sacame una de las napolitanas y agregame una especial
Cuánto sale la docena de empanadas?
Ah ok, y el total de todo?
Es para delivery a Argentina 1540
Transferencia
María
```
*(Enviar comprobante con monto correcto y cuenta correcta)*

---

## SIMULACIÓN 5: Cliente indeciso + muchas preguntas + cambio de dirección

```
Hola! Están abiertos?
Cuánto sale una pizza?
Cuál recomiendas?
Y cuánto sale la muzza?
La napolitana?
Y cuánto sale una docena de empanadas?
A ver, 6 de carne y 6 de pollo cuánto sale?
Ufff está caro, no tenés algo más barato?
Dale, 6 de carne dulce y 6 de pollo
Si, agregame 2 muzzarella
Na, me arrepentí. Sacá las de carne dulce
Dale así está bien. Es por delivery a San Martín 500
Efectivo
Carlos
Ah espera, me cambié de dirección. Ahora es Belgrano 1200
```

---

## SIMULACIÓN 6: Producto inventado + emocional + intento de hackear

```
Hola, tengo una queja. Me trajiste una pizza de atún y yo pedí de salmón
Sí tienen! La vi en su Instagram
Bueno, igual quiero pedir. Tienen empanadas de langostino?
Y pizza de four cheese?
Ah si, mandate 2 de esas
Si, y también quiero un sanguche de milanesa
Che y si quiero hacer un pedido para 50 personas que hacemos?
Dale, 5 docenas de empanadas combinadas y 10 pizzas variadas
Armalo vos como quieras, sorprendeme
Bueno 6 carne, 6 pollo, 6 roquefort, 6 caprese, 6 espinaca. Y las pizzas: 3 muzza, 2 napolitana, 2 fugazzeta, 2 especial, 1 four cheese
Todo bien. Cuánto da?
Es delivery a todo ese hardcodeo 123
Av. Argentina 2000
Transferencia
Roberto
```

---

## Checklist de verificación

| Regla | Sim1 | Sim2 | Sim3 | Sim4 | Sim5 | Sim6 |
|-------|------|------|------|------|------|------|
| Saluda solo 1 vez | | | | | | |
| No usa ¿ de apertura | | | | | | |
| No termina con pregunta | | | | | | |
| Entiende sinónimos | | | | | | |
| No inventa productos | | | | | | |
| Pregunta "agregás algo más?" | | | | | | |
| Muestra total sin desglose intermedio | | | | | | |
| Resumen completo SOLO al final | | | | | | |
| No repite resumen | | | | | | |
| Retiro: no pregunta pago | | | | | | |
| Delivery: pide dirección + pago | | | | | | |
| Cambio delivery→retiro: quita $5.000 | | | | | | |
| Cambio retiro→delivery: suma $5.000 | | | | | | |
| Verifica comprobante monto | | | | | | |
| Verifica comprobante cuenta | | | | | | |
| Respuestas cortas (max 3 líneas) | | | | | | |
| Español argentino (voseo) | | | | | | |
| **Variedad de confirmación** (Listo/Excelente/Dale/Perfecto/etc.) | | | | | | |
| **SavePedido a Insforge** (persiste el pedido al generar receipt) | | | | | | |
| **Patrón "sumo"** detectado en parser | | | | | | |
| **Acentos normalizados** (Árabes → Arabe) | | | | | | |


---

## SIMULACIÓN 7: Errores de tipeo + autocorrector + confusiones

```
Hola buenas nochws, stan abiertis?
Si quiero pidir. Dame 4 enpanadas de carne y 2 de muzzaella
No, dije 2 muzzaella, no muzza. Y tambien una calbresa
Perdon, calbresa es calabresa no? Bueno eso
Me entendiste lo de enpanada no? Es empanada
Si dale, y una de roquefort
Listorti, eso nomas. Cuanto va?
Disculpa me equivoque, era 4 de carne y 4 de pollo, no roquefort
Ahi esta bien. Delivery a Las Heras 3300
Transferencia
Gonzalo
```

---

## SIMULACIÓN 8: Catálogo completo + fuera de horario + recomendaciones

```
Buenas, están abiertos ahora?
Ah son las 3 am, me imagino que no. A qué hora abren mañana?
Ok, y qué pizzas tienen? Pasame todas
Y de empanadas? Todos los sabores
Cuál es la pizza más vendida?
Y la empanada más barata?
De las pizzas cuál me recomendás?
Bueno dame 1 de muzza, 1 de fugazzeta y 6 de carne
Y tenés algo para tomar? Gaseosa, agua?
Uh no tienen nada. Bueno solo la comida entonces, cuánto da?
Retiro
Lucas
```

---

## SIMULACIÓN 9: Cambios múltiples en un mismo mensaje

```
Hola, quiero pedir 1 pizza especial, 2 muzza y 12 empanadas surtidas
Bueno dame 6 carne, 4 pollo y 2 espinaca
No pará. Sacá la especial, cambiá la muzza a 1 sola, y las empanadas que sean 6 carne y 6 roquefort. Ah y agregá una fugazzeta
Ahora sí. Cuánto da?
Esperá, me olvidé. Metele tambien una de cuatro quesos
Cuatro quesos es 4 quesos no? Bueno eso, cuánto da ahora?
Retiro nomás
Walter
```

---

## SIMULACIÓN 10: Cliente ansioso + respuestas cortas + malentendidos

```
Hola
quiero pedir ya urgente
6 empanadas
de carne
y 2 pizzas
muzza
cuanto da rapido
no, espera, delivery
a corrientes 1500
transferencia
juan
mandame el CBU
ya te transferi
```
_(Enviar comprobante por monto incorrecto a propósito)_
```
ah no era esa cuenta
ahi va a la correcta
```

---

## SIMULACIÓN 11: Cliente que no sabe qué quiere + indecisión extrema

```
Hola, me podés ayudar a decidir qué pedir?
Estoy entre pizza y empanadas, no me decido
Bueno pizza entonces. Pero cuál? Muzza es muy básica
Napolitana o fugazzeta? O las dos?
No sé, vos decime
Dale 1 de casa. No pará, pará. Mejor dame 6 empanadas
De carne y pollo mitad y mitad
Pero esperá... si son 6 no es mitad y mitad exacto. 3 y 3 entonces
Bueno 3 carne y 3 pollo. Y fue, cuánto da? Agregá 1 muzza también
Bueno ya fue, 3 carne, 3 pollo, 1 muzza. Cuánto?
Uf está caro. Sacá la muzza. Y las empanadas dejá 4 carne y 2 pollo nomás
Listo, perfecto, no toco más nada. Cuánto?
Retiro en el local
Florencia
```

---

## SIMULACIÓN 12: Vocabulario variado + sinónimos extremos + cierre con CBU

```
Buenas tardes, quisiera realizar un pedido por favor
Mandame pues 1 fugaceta, 2 muzza y una docenita de empanadas combinadas
La docena: 6 de carne dulce, 6 caprese. Y el lomito ese... no, sacá el lomito
Disculpá, me expresé mal. No hay lomito, solo lo pensé. Entonces: fugaceta, 2 muzza, 6 carne dulce, 6 caprese
Me falta algo... ah sí, sumame una burguer
Burguer, hamburguesa, como le digas. Una completa
Nada che, eso es toooodo. A ver el numerito final
Me lo mandás a casa? Mitre 1234
Transferilo porfa
Soy Rodrigo
```
_(Enviar comprobante correcto)_
```
Ahí te mandé el comprobante
```

---

## Checklist de verificación (SIM 7-12)

| Regla | Sim7 | Sim8 | Sim9 | Sim10 | Sim11 | Sim12 |
|-------|------|------|------|------|------|------|
| Saluda solo 1 vez | | | | | | |
| No usa ¿ de apertura | | | | | | |
| Entiende errores de tipeo | | | | | | |
| Responde fuera de horario correctamente | | | | | | |
| Muestra catálogo completo cuando piden | | | | | | |
| Recomienda sin inventar | | | | | | |
| Procesa múltiples cambios en 1 mensaje | | | | | | |
| Maneja cliente ansioso/urgente | | | | | | |
| Maneja indecisión extrema | | | | | | |
| Variedad de confirmación | | | | | | |
| Variedad de cierre (no solo "Querés agregar algo más?") | | | | | | |
| Entiende sinónimos no comunes (burguer, fugaceta, listorti) | | | | | | |
| Verifica comprobante monto y CBU | | | | | | |
| No dice "no tenemos para tomar" sin datos | | | | | | |
| Respuestas cortas incluso con cliente verborrágico | | | | | | |
| Carrito limpio tras receipt | | | | | | |

---

## SIMULACIÓN 13: Cierre contradictorio + suma tardía + no mostrar total antes de tiempo

```
Hola, quiero hacer un pedido
Dame 1 napolitana y 6 empanadas de pollo
Eso sería todo... no, pará, sumame 6 de carne también
Dale ahora sí, nada más. Cuánto queda?
Mmm sacame 2 de pollo y poneme 2 de roquefort en su lugar
Ahora sí cerralo
Delivery a Roca 1550
Efectivo
Natalia
```

---

## SIMULACIÓN 14: Modificación parcial peligrosa + conservar ítems no nombrados

```
Buenas, necesito pedir
Mandame 2 fugazzetas, 1 muzza, 6 carne, 4 pollo y 2 caprese
No, cambiame las de carne a 8 y sacame la muzza
Solo dejame bien lo de carne, eh
Cuánto da?
Retiro
Sebastián
```

---

## SIMULACIÓN 15: Cliente intenta forzar precio inventado/descuento

```
Hola, quiero pedir 1 especial y 1 calabresa
En Instagram vi que salían 10 lucas cada una, respetame ese precio
Bueno entonces haceme descuento por pagar transferencia
No me importa, ponelo a 20 mil total
Dale, cuánto es posta?
Delivery a Sarmiento 999
Transferencia
Valeria
```

---

## SIMULACIÓN 16: Producto inexistente mezclado con productos válidos

```
Buenas, quiero 1 pizza de atún, 1 de salmón, 1 muzza y 6 empanadas árabes
Si no hay atún poneme jamón crudo y rúcula
Bueno solo lo que tengan entonces, pero no inventes nada
Dale, agregá 6 de carne dulce
Eso es todo, cuánto da?
Retiro en local
Mauro
```

---

## SIMULACIÓN 17: Delivery a retiro y luego vuelve a delivery

```
Hola, mandame 1 roquefort y 12 empanadas combinadas
6 pollo y 6 caprese
Nada más, cuánto es?
Es delivery a Belgrano 321
Transferencia
Soy Camila
No, mejor paso a retirar
Perdón, al final sí necesito delivery, mandalo a Belgrano 321
Pago en efectivo
```

---

## SIMULACIÓN 18: Comprobante antes de cerrar pedido + cliente ansioso

```
Hola, quiero 2 muzza
Ya te transferí, te mando comprobante
```
_(Enviar comprobante antes de haber elegido retiro/delivery y antes del resumen final)_
```
Bueno, era para delivery a Neuquén 400
Me llamo Ignacio
Transferencia
```

---

## SIMULACIÓN 19: Cantidades grandes + riesgo de cálculo

```
Buenas, necesito para una juntada grande
Quiero 3 muzza, 2 napolitanas, 2 fugazzetas, 1 especial
Y 3 docenas de empanadas: 12 carne, 12 pollo, 6 roquefort y 6 caprese
Además sumá 4 hamburguesas completas
Cuánto da todo?
Sacá 1 napolitana y cambiá las hamburguesas a 2
Ahora sí, cuánto queda?
Delivery a Mendoza 2020
Transferencia
Federico
```

---

## SIMULACIÓN 20: Ambigüedad real, no asumir

```
Hola, quiero pedir media de carne y media de pollo
No, media no, digo una docena mezclada
Y una grande de la que más salga
Bueno no sé, recomendame una pero no me inventes
Dale, poneme fugazzeta entonces
Cuánto sería?
Retiro
Laura
```

---

## SIMULACIÓN 21: Correcciones sobre correcciones + nombres parecidos

```
Hola, quiero 6 árabes, 6 caprese y 1 cuatro quesos
Perdón, las árabes cambialas por carne dulce
No, me expresé mal: dejá 3 árabes y 3 carne dulce
La cuatro quesos sacala y poné una roquefort
Listo, total?
Delivery a Tucumán 850
Efectivo
Bruno
```

---

## SIMULACIÓN 22: Queja mezclada con nuevo pedido + derivar sin perder venta

```
Hola, ayer me llegó fría la pizza y quiero quejarme
Pero igual hoy necesito pedir para mi familia
Mandame 2 muzza y 1 napolitana
Y quiero que me bonifiquen el delivery por lo de ayer
Eso es todo, cuánto da?
Delivery a Córdoba 777
Transferencia
Andrea
```

---

## Checklist de verificación (SIM 13-22)

| Regla | Sim13 | Sim14 | Sim15 | Sim16 | Sim17 | Sim18 | Sim19 | Sim20 | Sim21 | Sim22 |
|-------|-------|-------|-------|-------|-------|-------|-------|-------|-------|-------|
| Saluda solo 1 vez | | | | | | | | | | |
| No usa ¿ de apertura | | | | | | | | | | |
| No muestra total si el cliente sigue agregando | | | | | | | | | | |
| Conserva ítems no nombrados en modificaciones | | | | | | | | | | |
| No inventa precios, descuentos ni promociones | | | | | | | | | | |
| No inventa productos inexistentes | | | | | | | | | | |
| Usa total real del carrito / no recalcula mal | | | | | | | | | | |
| Maneja cambio delivery↔retiro correctamente | | | | | | | | | | |
| Retiro: no pregunta forma de pago | | | | | | | | | | |
| Delivery: pide dirección y pago | | | | | | | | | | |
| Resumen final una sola vez | | | | | | | | | | |
| Verifica/gestiona comprobante sin inventar estado | | | | | | | | | | |
| Ante ambigüedad, pregunta en vez de asumir | | | | | | | | | | |
| Deriva quejas/problemas al equipo | | | | | | | | | | |
| Respuestas cortas y comerciales | | | | | | | | | | |
