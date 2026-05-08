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
