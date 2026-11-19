# Plan de ejecución — Escáner de recibos con IA (PWA)

**Meta:** cumplir los 35 requerimientos (obligatorios + deseables) en 8 horas,
con la sorpresa del contador prevista por diseño y sin sacrificar seguridad.

**Estado de partida:** el esquema de Supabase ya está escrito y versionado en
`supabase/` (RF-02, RF-03, RF-34 y la base del rol contador). Eso libera ~1 h
frente al plan sugerido por el brief y financia los deseables.

---

## 1. Stack y decisiones

| Área | Elección | Por qué |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite | Rápido, tipado, ecosistema PWA |
| Estilos | Tailwind CSS | Mobile-first sin CSS a mano |
| Datos | `@supabase/supabase-js` | Auth, REST, Storage y RPC en un cliente |
| Estado servidor | TanStack Query | Caché, reintentos y estados de carga/error |
| Validación | Zod | Mismo esquema en Edge Function y cliente (RF-12) |
| IA | Gemini Flash (vision) vía Edge Function | JSON Schema nativo, bajo costo, buena lectura de recibos |
| PWA | `vite-plugin-pwa` (Workbox) | Manifest, precache y modo offline |
| Gráfico | Barras CSS | Cumple RF-25 sin dependencia extra |
| Deploy | Vercel | HTTPS público, deploy por push, ideal para PWA |
| Backend IA | Supabase Edge Function | La llave nunca llega al navegador (RF-10) |

**Sin CLI de Supabase:** las Edge Functions se crean/editan desde
**Dashboard → Edge Functions**, y los secretos en **Project Settings → Edge
Functions → Secrets**. El código igual se versiona en `supabase/functions/`.

### Reglas de oro

1. La `service_role` **no** se usa en el navegador ni en la Edge Function
   (esta última trabaja con el JWT del usuario y RLS).
2. Toda imagen se comprime en el cliente antes de subir (RF-07) y el bucket
   vuelve a imponer 1.5 MB.
3. Los totales se calculan en **un solo módulo** (`src/lib/totals.ts`) para que
   el cambio de regla del contador sea de una línea.
4. Lo obligatorio nunca se corta; los deseables se cortan en el orden definido
   en la sección 7.

---

## 2. Arquitectura y flujo

```text
Móvil (PWA React)
  │  cámara/galería → canvas (≤1600 px, ≤1.5 MB) → SHA-256
  ├─► Supabase Storage (bucket privado receipts/{uid}/{expenseId}/foto.jpg)
  ├─► Postgres (expenses draft + expense_images)
  └─► Edge Function extract-receipt (JWT del usuario)
          ├─ valida ruta y cuota diaria (consume_ai_quota)
          ├─ descarga la imagen con RLS
          ├─ Gemini vision + JSON Schema
          ├─ Zod → si falla, 1 reintento → si falla, requires_review
          └─ devuelve campos + confianza + is_receipt + ítems

Pantalla de revisión (imagen + formulario)
  ├─ resalta confianza < 0.70, valida aritmética, avisa duplicados
  ├─ usuario corrige categoría/campos y confirma
  └─ guarda status = confirmed (solo estos suman)

Contador: lista global → detalle → aprobar/rechazar + comentario
Empleado: ve el estado de aprobación y el comentario
```

**Orden de creación del gasto:** se genera el `expenseId` en el cliente, se sube
la imagen y se inserta el gasto en `draft/requires_review` **antes** de llamar a
la IA. Si la IA falla o el usuario cierra la app, la foto y el gasto no se
pierden.

---

## 3. Cronograma (8 h)

| Hora | Fase | Entregable verificable | RF |
|---|---|---|---|
| 0:00–0:30 | Plan + prerequisitos | Este documento, repo Git, Node/Git instalados, migraciones aplicadas, usuarios demo | 34 |
| 0:30–0:55 | **Spike de IA** | Edge Function mínima responde JSON válido con una foto real (riesgo eliminado antes de la UI) | 10, 11 |
| 0:55–1:40 | Base + Auth | Vite/Tailwind, cliente Supabase, registro/login/logout, rutas protegidas, layout móvil | 01, 28 |
| 1:40–2:40 | Captura + Storage | Cámara/galería, preview/repetir, compresión, hash, subida con progreso y reintento, gasto draft creado | 05–08, 20 |
| 2:40–3:20 | Lista + detalle | Lista con miniaturas firmadas, orden por fecha, detalle con zoom, editar y borrar (incluye Storage) | 21, 22, 24, 32 |
| 3:20–3:30 | Checkpoint | Deploy preliminar en Vercel y prueba rápida en el celular | 33 |
| **3:30–4:00** | **Cambio sorpresa** | UI de contador: bandeja global, aprobar/rechazar con comentario; totales pasan a “solo aprobados” en un solo cambio | 04, 19 |
| 4:00–5:10 | Extracción + revisión | Función completa, Zod + reintento, no-recibo, confianza resaltada, aritmética, duplicados, categoría, ítems, guardar | 11–18 |
| 5:10–5:55 | Reportes | Filtros combinados + búsqueda, resumen mensual con barras, CSV compatible con Excel | 23, 25, 26 |
| 5:55–6:40 | PWA + offline | Manifest, iconos 192/512, service worker, shell offline, caché de la última lista, estados loading/empty/error | 29–32 |
| 6:40–7:10 | QA en dispositivo | Flujo completo en celular real, RLS con 2 usuarios, CSV en Excel, borrado en Storage, Lighthouse | 02, 03, 33 |
| 7:10–7:40 | Deseables restantes | Multi-foto/PDF, USD con tasa, cola offline o agente en lenguaje natural (según qué falte) | 09, 27, 31 |
| 7:40–8:00 | Cierre | README, usuarios de prueba, guion del video y grabación durante el último test | Entregables |

**Buffer real:** 3:20–3:30 y cualquier adelanto del spike. Si el reloj se
retrasa, se aplica el orden de recorte de la sección 7.

---

## 4. Matriz de requerimientos

### A. Cuentas y seguridad

| ID | Solución | Fase |
|---|---|---|
| RF-01 | `signUp`/`signInWithPassword`/`signOut`, listener de sesión, `<ProtectedRoute>` | 0:55 |
| RF-02 | RLS ya migrado; triggers anti-escalada y anti-autoaprobación; prueba con dos JWT | 0:30 / 6:40 |
| RF-03 | Bucket privado, rutas por `uid`, signed URLs de 60 min, borrado de objetos | 1:40 |
| RF-04 | `profiles.role`, lectura global para contador, bandeja de aprobación | 3:30 |

### B. Captura

| ID | Solución | Fase |
|---|---|---|
| RF-05 | `<input type="file" accept="image/*" capture="environment">` + botón “Galería”; si se niega el permiso, se explica y se ofrece la galería | 1:40 |
| RF-06 | Preview a pantalla completa con “Usar foto” / “Repetir” | 1:40 |
| RF-07 | Canvas: lado máximo 1600 px, JPEG calidad 0.8→0.5 hasta ≤1.5 MB; validación final + límite del bucket | 1:40 |
| RF-08 | Subida por `XMLHttpRequest` al endpoint de Storage para tener `upload.onprogress`; error con “Reintentar” | 1:40 |
| RF-09 | `expense_images` ya soporta N fotos; UI “Añadir página” + carrusel; PDF aceptado en bucket y enviado como `application/pdf` a Gemini | 7:10 |

### C. Extracción con IA

| ID | Solución | Fase |
|---|---|---|
| RF-10 | Edge Function `extract-receipt`; `GEMINI_API_KEY` en Secrets; CORS y `verify_jwt` | 0:30 |
| RF-11 | Prompt + `responseSchema`: comercio, fecha, moneda, subtotal, itbis, propina, total, método de pago, RNC, NCF, ítems, categoría | 0:30 / 4:00 |
| RF-12 | Zod en servidor y cliente; si falla → reintento con instrucción correctiva → si falla, `requires_review` con campos vacíos | 4:00 |
| RF-13 | Enum de categorías en DB; la IA sugiere y el `<select>` permite cambiarla | 4:00 |

### D. Revisión y guardado

| ID | Solución | Fase |
|---|---|---|
| RF-14 | `field_confidence` jsonb; umbral 0.70 → borde ámbar + leyenda; `review_reasons` | 4:00 |
| RF-15 | `is_receipt=false` o ilegible → mensaje claro, formulario vacío, `requires_review`; nunca inventar | 4:00 |
| RF-16 | `subtotal + itbis + propina` vs `total` con tolerancia ±0.05; banner de aviso, no bloquea | 4:00 |
| RF-17 | Tabla editable de ítems (descripción, cantidad, precio, total de línea) | 4:00 |
| RF-18 | Layout móvil: imagen colapsable arriba + formulario; guardado fijo abajo | 4:00 |
| RF-19 | `status` draft/confirmed/requires_review; reportes filtran `confirmed` | 2:40 |
| RF-20 | Hash SHA-256 + consulta por comercio/fecha/total; modal “posible duplicado” con enlace al existente; guardar igual permitido | 1:40 / 4:00 |
| RF-21 | Editar, borrar con confirmación y eliminación previa de objetos de Storage | 2:40 |

### E. Listado y reportes

| ID | Solución | Fase |
|---|---|---|
| RF-22 | Lista por `expense_date desc`, miniatura firmada, comercio, fecha, total y categoría | 2:40 |
| RF-23 | Filtros server-side combinables (rango, categoría, estado) + búsqueda `ilike` con debounce | 5:10 |
| RF-24 | Detalle con visor: zoom por botones y gesto, imagen firmada | 2:40 |
| RF-25 | Resumen del mes: total + barras por categoría sobre `total_dop`, coherente con la regla de conteo | 5:10 |
| RF-26 | CSV con BOM UTF-8 y separador `;` (Excel es-DO), campos entrecomillados, nombre con rango | 5:10 |
| RF-27 | Agente: Gemini convierte la pregunta en un filtro JSON permitido → consulta parametrizada con RLS → respuesta calculada, nunca SQL libre | 7:10 |

### F. Móvil y PWA

| ID | Solución | Fase |
|---|---|---|
| RF-28 | Diseño a 360 px, objetivos táctiles ≥44 px, navegación inferior | 0:55 |
| RF-29 | `manifest.webmanifest`, iconos 192/512, `generateSW`, standalone, prueba de instalación | 5:55 |
| RF-30 | Precache del shell + última lista por usuario en `localStorage`; banner “sin conexión” | 5:55 |
| RF-31 | Cola en IndexedDB: blob comprimido + metadatos; se procesa al evento `online`, con estado por ítem | 5:55 / 7:10 |
| RF-32 | Componentes `Loading`, `Empty`, `ErrorState` reutilizados en todas las pantallas | 2:40 en adelante |

### G. Despliegue y calidad

| ID | Solución | Fase |
|---|---|---|
| RF-33 | Vercel desde GitHub + URL HTTPS probada en celular real | 3:20 / 6:40 |
| RF-34 | Migraciones SQL ya versionadas; el README explica recrear desde cero | 0:30 |
| RF-35 | 1.5 MB en cliente y bucket + 30 análisis/día por usuario en la Edge Function | 0:30 / 4:00 |

---

## 5. Contrato de la extracción (Zod)

```ts
{
  is_receipt: boolean,
  document_type: 'receipt' | 'invoice' | 'other',
  merchant: string | null,
  expense_date: 'YYYY-MM-DD' | null,
  currency: 'DOP' | 'USD' | null,
  subtotal: number | null,
  itbis: number | null,
  tip: number | null,
  total: number | null,
  payment_method: string | null,
  rnc: string | null,          // 9 u 11 dígitos si existe
  ncf: string | null,          // formato e-CF / B01 / B02 si existe
  category: 'alimentos' | 'combustible' | 'transporte' | 'oficina' | 'servicios' | 'otros',
  items: { description: string, quantity: number, unit_price: number, line_total: number | null }[],
  confidence: Record<string, number>, // 0..1 por campo
  notes: string | null
}
```

Reglas del prompt: no inventar; si un dato no se lee, `null` y confianza 0; si la
imagen no es un recibo, `is_receipt=false`; moneda por defecto DOP solo si hay
señales locales; ITBIS 18 % no se asume, se lee.

---

## 6. Seguridad y pruebas

### Checklist de seguridad

- [ ] Dos JWT distintos: A no ve, edita ni borra filas de B (REST directo).
- [ ] A no puede leer archivos de B ni firmar sus URLs.
- [ ] Empleado no puede cambiar su rol ni aprobar su gasto (`42501`).
- [ ] Contador ve todo y aprueba/rechaza; no borra gastos ajenos.
- [ ] `service_role` ausente del bundle (buscar en `dist/`).
- [ ] Edge Function valida que la ruta empiece por el `uid` del JWT.
- [ ] Cuota de IA devuelve error claro al superar 30/día.
- [ ] Caché local y service worker se limpian al cerrar sesión.

### Casos de prueba funcionales

1. Recibo nítido → ≥7 campos correctos.
2. Recibo borroso → `requires_review`, campos vacíos, mensaje.
3. Foto que no es recibo → mensaje, no se guardan datos inventados.
4. Factura con RNC/NCF → campos presentes.
5. Aritmética rota → advertencia visible.
6. Duplicado por hash y por comercio/fecha/total → advertencia.
7. Confirmar → aparece en totales; borrador no.
8. Filtros combinados + búsqueda.
9. CSV abierto en Excel: tildes y columnas correctas.
10. 360 px, iOS Safari y Android Chrome, cámara real.
11. Modo avión: abre, muestra última lista y aviso; cola se procesa al volver.
12. Instalación PWA en standalone.

---

## 7. Riesgos y orden de recorte

| Riesgo | Mitigación |
|---|---|
| Sin Node/Git en la máquina | `winget install OpenJS.NodeJS.LTS` y `Git.Git` en 0:00 |
| Sin CLI de Supabase | Edge Function desde el Dashboard; código versionado en el repo |
| IA lenta o JSON inválido | Timeout 30 s, 1 reintento, fallback `requires_review`, skeleton en UI |
| Cámara iOS ignora `capture` | Aceptar que Safari ofrece cámara/galería; el flujo funciona igual |
| Costo de IA | Imagen comprimida, 30 llamadas/día, modelo Flash |
| Tiempo insuficiente | Recortar en este orden: PDF/multi-foto → agente NL → cola offline → USD. **Nunca** RLS, revisión, duplicados ni PWA |

---

## 8. Entregables y cierre

- [ ] URL pública probada en un celular real.
- [ ] Repo Git con commits por fase y `supabase/migrations/`.
- [ ] README: setup, variables, decisiones, usuarios demo, límites y pendientes.
- [ ] Dos usuarios: `empleado@demo.com` y `contador@demo.com` (contraseñas en el README).
- [ ] Video 3–5 min grabado durante el QA final (guion abajo).
- [ ] Preparación de la revisión en vivo (10 min).

### Guion del video (3–5 min)

1. Login del empleado en el celular (20 s).
2. Foto real → compresión/subida con progreso (45 s).
3. Extracción y pantalla de revisión: confianza, aritmética, duplicado, corrección (60 s).
4. Guardar, lista, detalle con zoom, filtros y resumen (45 s).
5. CSV en Excel (20 s).
6. Login del contador → aprobar con comentario (40 s).
7. Modo offline + instalación PWA (30 s).
8. Cierre: una decisión técnica (RLS + llave fuera del navegador) (20 s).

### Revisión en vivo: cambios pequeños ya ensayados

- Subir/bajar el umbral de confianza (0.70 → 0.80).
- Agregar una categoría al enum (migración + UI).
- Cambiar el separador del CSV.
- Activar la regla “solo aprobados cuentan” y explicar el impacto.

---

## 9. Definición de “perfecto”

1. Los 35 RF tienen evidencia en la app o en el repositorio.
2. Ningún requisito obligatorio depende de un camino feliz: hay estados de
   carga, vacío y error.
3. El aislamiento se demuestra con dos usuarios y llamadas directas a la API.
4. La llave de IA y `service_role` no aparecen en el navegador.
5. El README dice la verdad sobre lo que quedó fuera y por qué.
