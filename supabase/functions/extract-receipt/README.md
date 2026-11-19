# Edge Function `extract-receipt`

Analiza una imagen o PDF de recibo con Gemini y devuelve JSON validado con Zod.

## Despliegue sin CLI (Dashboard)

1. **Supabase Dashboard → Edge Functions → Deploy a new function**.
2. Nombre: `extract-receipt`.
3. Pega el contenido completo de `supabase/functions/extract-receipt/index.ts`.
4. Deja **Verify JWT** activado.
5. **Project Settings → Edge Functions → Secrets**:
   - `GEMINI_API_KEY` = tu clave de Google AI Studio.
   - `GEMINI_MODEL` = `gemini-2.5-flash` (opcional).
6. Deploy.

## Contrato

```http
POST /functions/v1/extract-receipt
Authorization: Bearer <JWT del usuario>
Content-Type: application/json

{ "path": "<uid>/<expense_id>/<archivo>.jpg" }
```

Respuesta correcta:

```json
{ "ok": true, "model": "gemini-2.5-flash", "data": { "...": "..." } }
```

Errores: `{ "ok": false, "code": "quota|invalid_json|auth|path|...", "error": "..." }`.

## Seguridad y costo

- La función usa el JWT del usuario, no `service_role`.
- Verifica que la ruta empiece por el `uid` y que exista en `expense_images`.
- Descarga la imagen con RLS (bucket privado).
- Consume la cuota diaria con `consume_ai_quota()` (30 por usuario/día).
- Limita a 2 llamadas a Gemini por recibo (1 reintento si el JSON no valida).
- Máximo 1.6 MB por archivo.

## Probar sin la app

```powershell
$jwt = "<access_token>"
$body = '{"path":"<uid>/<expense_id>/<archivo>.jpg"}'
Invoke-RestMethod -Method Post `
  -Uri "https://<ref>.supabase.co/functions/v1/extract-receipt" `
  -Headers @{ Authorization = "Bearer $jwt"; apikey = "<anon-key>" } `
  -ContentType "application/json" -Body $body
```
