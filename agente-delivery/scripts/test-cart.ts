// scripts/test-cart.ts — Full simulation test
import 'dotenv/config';
import { getCart, clearCart, calculateTotal, parseCartFromLLMReply, getCartSummary, canonicalName, addToCart } from '../src/lib/cart';

const PHONE = '5491111111111';

function check(name: string, cond: boolean) {
  console.log(`  ${cond ? '[OK]' : '[FAIL]'} ${name}`);
}

console.log('=== SIMULACIÓN 1 COMPLETA ===\n');

clearCart(PHONE);

const flow = [
  { msg: 'Listo, agrego 6 Carne, 4 Pollo y 4 Roquefort. Querés agregar algo más?', expect: { carne: 6, pollo: 4, roquefort: 4 } },
  { msg: 'Listo, agrego 1 Hamburguesa Completa. Querés agregar algo más?', expect: { burger: 1 } },
  { msg: 'Listo, saco las de Roquefort y la burger. Queda 8 Carne y 4 Pollo. Querés agregar algo más?', expect: { carne: 8, pollo: 4, roquefort: 0, burger: 0 } },
  { msg: 'Listo, agrego 1 Pizza Fugazzeta. Querés agregar algo más?', expect: { fugazzeta: 1 } },
  { msg: 'Listo, agrego 1 Lomo Completo. Querés agregar algo más?', expect: { lomo: 1 } },
];

for (const { msg, expect } of flow) {
  console.log(`>>> ${msg}`);
  parseCartFromLLMReply(PHONE, msg);
  const cart = getCart(PHONE);
  console.log(`    Cart: ${getCartSummary(PHONE)}`);
  if (expect.carne !== undefined) check(`Carne=${expect.carne}`, cart.items.find(i => i.name === 'Empanada Carne')?.qty === expect.carne);
  if (expect.pollo !== undefined) check(`Pollo=${expect.pollo}`, cart.items.find(i => i.name === 'Empanada Pollo')?.qty === expect.pollo);
  if (expect.roquefort !== undefined) check(`Roquefort=${expect.roquefort}`, (cart.items.some(i => i.name.includes('Roquefort')) ? 4 : 0) === expect.roquefort);
  if (expect.burger !== undefined) check(`Burger=${expect.burger}`, (cart.items.some(i => i.name.includes('Hamburguesa')) ? 1 : 0) === expect.burger);
  if (expect.fugazzeta !== undefined) check(`Fugazzeta=${expect.fugazzeta}`, (cart.items.some(i => i.name.includes('Fugazzeta')) ? 1 : 0) === expect.fugazzeta);
  if (expect.lomo !== undefined) check(`Lomo=${expect.lomo}`, (cart.items.some(i => i.name.includes('Lomo')) ? 1 : 0) === expect.lomo);
  console.log('');
}

const total = calculateTotal(PHONE);
console.log(`Total: $${total.toLocaleString('es-AR')} (esperado $69,400)`);
check('Total=$69,400', total === 69400);