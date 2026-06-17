import type { Request, Environment, CodeTarget, KeyValue } from '../types'
import { interpolate } from './variableSubstitution'
import { decodeJwt } from './jwtDecoder'

// A resolved request with all variable tokens substituted and auth header injected
interface ResolvedRequest {
  method: string
  url: string
  headers: KeyValue[]
  body: Request['body']
  auth: Request['auth']
}

function resolveRequest(request: Request, activeEnv: Environment | null): ResolvedRequest {
  const variables = activeEnv?.variables ?? []
  const resolvedUrl = interpolate(request.url, variables).result
  const resolvedHeaders: KeyValue[] = request.headers.map((h) => ({
    ...h,
    value: interpolate(h.value, variables).result,
  }))
  const resolvedBody: Request['body'] = {
    type: request.body.type,
    content: interpolate(request.body.content, variables).result,
  }
  const headersWithAuth = [...resolvedHeaders]
  const auth = request.auth
  if (auth.type === 'bearer') {
    const rawToken = auth.token ?? activeEnv?.jwtToken ?? ''
    if (rawToken) {
      const jwtInfo = decodeJwt(rawToken)
      if (jwtInfo.valid && !jwtInfo.isExpired) {
        headersWithAuth.push({ key: 'Authorization', value: `Bearer ${rawToken}`, enabled: true })
      }
    }
  } else if (auth.type === 'basic') {
    const encoded = btoa(`${auth.username ?? ''}:${auth.password ?? ''}`)
    headersWithAuth.push({ key: 'Authorization', value: `Basic ${encoded}`, enabled: true })
  }
  return { method: request.method, url: resolvedUrl, headers: headersWithAuth, body: resolvedBody, auth: request.auth }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function enabledHeaders(headers: KeyValue[]): KeyValue[] {
  return headers.filter((h) => h.enabled)
}

function shellEscape(value: string): string {
  return value.replace(/'/g, `'\\''`)
}

function hasBody(req: ResolvedRequest): boolean {
  return ['POST', 'PUT', 'PATCH'].includes(req.method.toUpperCase())
}

function headersMap(req: ResolvedRequest): Record<string, string> {
  const obj: Record<string, string> = {}
  for (const h of enabledHeaders(req.headers)) obj[h.key] = h.value
  return obj
}

// ---------------------------------------------------------------------------
// Builder: cURL — structural token: "curl"
// ---------------------------------------------------------------------------

function buildCurl(req: ResolvedRequest): string {
  const lines: string[] = [`curl --request ${req.method}`]
  lines.push(`  --url '${shellEscape(req.url)}'`)
  for (const h of enabledHeaders(req.headers)) {
    lines.push(`  --header '${shellEscape(h.key)}: ${shellEscape(h.value)}'`)
  }
  if (hasBody(req) && req.body.content) {
    if (req.body.type === 'json') {
      lines.push(`  --header 'Content-Type: application/json'`)
      lines.push(`  --data '${shellEscape(req.body.content)}'`)
    } else if (req.body.type === 'x-www-form-urlencoded') {
      lines.push(`  --header 'Content-Type: application/x-www-form-urlencoded'`)
      lines.push(`  --data '${shellEscape(req.body.content)}'`)
    } else {
      lines.push(`  --form '${shellEscape(req.body.content)}'`)
    }
  }
  return lines.join(' \\\n')
}

// ---------------------------------------------------------------------------
// Builder: PHP cURL — structural token: "<?php"
// ---------------------------------------------------------------------------

function buildPhpCurl(req: ResolvedRequest): string {
  const sq = (s: string) => s.replace(/'/g, "\\'")
  const lines: string[] = ['<?php', '', '$curl = curl_init();', '', 'curl_setopt_array($curl, [']
  lines.push(`  CURLOPT_URL => '${sq(req.url)}',`)
  lines.push('  CURLOPT_RETURNTRANSFER => true,')
  lines.push(`  CURLOPT_CUSTOMREQUEST => '${req.method}',`)
  const hdrs = enabledHeaders(req.headers)
  if (hdrs.length > 0) {
    lines.push('  CURLOPT_HTTPHEADER => [')
    for (const h of hdrs) lines.push(`    '${sq(h.key)}: ${sq(h.value)}',`)
    lines.push('  ],')
  }
  if (hasBody(req) && req.body.content) lines.push(`  CURLOPT_POSTFIELDS => '${sq(req.body.content)}',`)
  lines.push(']);', '', '$response = curl_exec($curl);', 'curl_close($curl);', '', 'echo $response;')
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Builder: Laravel HTTP Client — structural token: "Http::"
// ---------------------------------------------------------------------------

function buildLaravel(req: ResolvedRequest): string {
  const sq = (s: string) => s.replace(/'/g, "\\'")
  const lines: string[] = ['<?php', '', 'use Illuminate\\Support\\Facades\\Http;', '']
  const hdrs = enabledHeaders(req.headers)
  const method = req.method.toLowerCase()
  if (hdrs.length > 0) {
    lines.push('$response = Http::withHeaders([')
    for (const h of hdrs) lines.push(`  '${h.key}' => '${h.value}',`)
    lines.push('])')
    if (hasBody(req) && req.body.content) {
      if (req.body.type === 'json') {
        lines.push(`  ->${method}('${sq(req.url)}', json_decode('${sq(req.body.content)}', true));`)
      } else {
        lines.push(`  ->asForm()`)
        lines.push(`  ->${method}('${sq(req.url)}', ['${sq(req.body.content).replace(/&/g, "', '")}']);`)
      }
    } else {
      lines.push(`  ->${method}('${sq(req.url)}');`)
    }
  } else {
    if (hasBody(req) && req.body.content) {
      if (req.body.type === 'json') {
        lines.push(`$response = Http::${method}('${sq(req.url)}', json_decode('${sq(req.body.content)}', true));`)
      } else {
        lines.push(`$response = Http::asForm()->${method}('${sq(req.url)}', ['${sq(req.body.content).replace(/&/g, "', '")}']);`)
      }
    } else {
      lines.push(`$response = Http::${method}('${sq(req.url)}');`)
    }
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Builder: JavaScript fetch() — structural token: "fetch("
// ---------------------------------------------------------------------------

function buildJsFetch(req: ResolvedRequest): string {
  const hdrs = headersMap(req)
  const options: Record<string, unknown> = { method: req.method }
  if (Object.keys(hdrs).length > 0) options.headers = hdrs
  if (hasBody(req) && req.body.content) {
    if (req.body.type === 'json') {
      const h = options.headers as Record<string, string> | undefined
      if (!h?.['Content-Type']) {
        if (!options.headers) options.headers = {}
        ;(options.headers as Record<string, string>)['Content-Type'] = 'application/json'
      }
    }
    options.body = req.body.content
  }
  return [
    `const response = await fetch('${req.url}', ${JSON.stringify(options, null, 2)});`,
    '',
    'const data = await response.json();',
    'console.log(data);',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Builder: Axios — structural token: "axios("
// ---------------------------------------------------------------------------

function buildAxios(req: ResolvedRequest): string {
  const hdrs = headersMap(req)
  const config: Record<string, unknown> = { method: req.method.toLowerCase(), url: req.url }
  if (Object.keys(hdrs).length > 0) config.headers = hdrs
  if (hasBody(req) && req.body.content) {
    if (req.body.type === 'json') {
      try { config.data = JSON.parse(req.body.content) } catch { config.data = req.body.content }
    } else {
      config.data = req.body.content
    }
  }
  return [
    "import axios from 'axios';",
    '',
    `const response = await axios(${JSON.stringify(config, null, 2)});`,
    '',
    'console.log(response.data);',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Builder: Python requests — structural token: "requests."
// ---------------------------------------------------------------------------

function buildPythonRequests(req: ResolvedRequest): string {
  const hdrs = headersMap(req)
  const method = req.method.toLowerCase()
  const kws: string[] = []
  if (Object.keys(hdrs).length > 0) kws.push(`headers=${JSON.stringify(hdrs)}`)
  if (hasBody(req) && req.body.content) {
    if (req.body.type === 'json') kws.push(`json=${req.body.content}`)
    else kws.push(`data=${JSON.stringify(req.body.content)}`)
  }
  const args = [`'${req.url}'`, ...kws].join(', ')
  return ['import requests', '', `response = requests.${method}(${args})`, '', 'print(response.json())'].join('\n')
}

// ---------------------------------------------------------------------------
// Builder: Python httpx (async) — structural token: "httpx."
// ---------------------------------------------------------------------------

function buildPythonHttpx(req: ResolvedRequest): string {
  const hdrs = headersMap(req)
  const method = req.method.toLowerCase()
  const kws: string[] = []
  if (Object.keys(hdrs).length > 0) kws.push(`headers=${JSON.stringify(hdrs)}`)
  if (hasBody(req) && req.body.content) {
    if (req.body.type === 'json') kws.push(`json=${req.body.content}`)
    else kws.push(`content=${JSON.stringify(req.body.content)}`)
  }
  const args = [`'${req.url}'`, ...kws].join(', ')
  return [
    'import httpx',
    'import asyncio',
    '',
    'async def main():',
    `    async with httpx.AsyncClient() as client:`,
    `        response = await client.${method}(${args})`,
    `        print(response.json())`,
    '',
    'asyncio.run(main())',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Builder: Ruby Net::HTTP — structural token: "Net::HTTP"
// ---------------------------------------------------------------------------

function buildRubyNetHttp(req: ResolvedRequest): string {
  const hdrs = headersMap(req)
  const methodClass = req.method.charAt(0) + req.method.slice(1).toLowerCase()
  const lines: string[] = [
    'require "uri"',
    'require "net/http"',
    '',
    `uri = URI("${req.url}")`,
    'http = Net::HTTP.new(uri.host, uri.port)',
    'http.use_ssl = uri.scheme == "https"',
    '',
    `request = Net::HTTP::${methodClass}.new(uri)`,
  ]
  for (const [k, v] of Object.entries(hdrs)) lines.push(`request["${k}"] = "${v}"`)
  if (hasBody(req) && req.body.content) {
    lines.push(`request.body = '${req.body.content.replace(/'/g, "\\'")}'`)
  }
  lines.push('', 'response = http.request(request)', 'puts response.body')
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Builder: Ruby Faraday — structural token: "Faraday"
// ---------------------------------------------------------------------------

function buildRubyFaraday(req: ResolvedRequest): string {
  const hdrs = headersMap(req)
  const method = req.method.toLowerCase()
  const lines: string[] = [
    'require "faraday"',
    '',
    'conn = Faraday.new do |f|',
    '  f.request :json',
    '  f.response :json',
    'end',
    '',
    `response = conn.${method}("${req.url}") do |req|`,
  ]
  for (const [k, v] of Object.entries(hdrs)) lines.push(`  req.headers["${k}"] = "${v}"`)
  if (hasBody(req) && req.body.content) {
    lines.push(`  req.body = '${req.body.content.replace(/'/g, "\\'")}'`)
  }
  lines.push('end', '', 'puts response.body')
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Builder: Go net/http — structural token: "http.NewRequest"
// ---------------------------------------------------------------------------

function buildGoNetHttp(req: ResolvedRequest): string {
  const hdrs = headersMap(req)
  const hasBodyFlag = hasBody(req) && req.body.content
  const lines: string[] = [
    'package main',
    '',
    'import (',
    '  "fmt"',
    '  "io"',
    '  "net/http"',
    ...(hasBodyFlag ? ['  "strings"'] : []),
    ')',
    '',
    'func main() {',
  ]
  if (hasBodyFlag) {
    lines.push(`  body := strings.NewReader(\`${req.body.content}\`)`)
    lines.push(`  req, _ := http.NewRequest("${req.method}", "${req.url}", body)`)
  } else {
    lines.push(`  req, _ := http.NewRequest("${req.method}", "${req.url}", nil)`)
  }
  for (const [k, v] of Object.entries(hdrs)) lines.push(`  req.Header.Set("${k}", "${v}")`)
  lines.push(
    '',
    '  client := &http.Client{}',
    '  resp, _ := client.Do(req)',
    '  defer resp.Body.Close()',
    '  body2, _ := io.ReadAll(resp.Body)',
    '  fmt.Println(string(body2))',
    '}',
  )
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Builder: Java OkHttp — structural token: "OkHttpClient"
// ---------------------------------------------------------------------------

function buildJavaOkHttp(req: ResolvedRequest): string {
  const hdrs = headersMap(req)
  const hasBodyFlag = hasBody(req) && req.body.content
  const lines: string[] = ['import okhttp3.*;', '', 'OkHttpClient client = new OkHttpClient();', '']
  if (hasBodyFlag) {
    const mt = req.body.type === 'json' ? 'application/json' : 'application/x-www-form-urlencoded'
    lines.push(`MediaType mediaType = MediaType.parse("${mt}");`)
    lines.push(`RequestBody body = RequestBody.create(mediaType, "${req.body.content.replace(/"/g, '\\"')}");`)
    lines.push('')
  }
  lines.push('Request request = new Request.Builder()')
  lines.push(`  .url("${req.url}")`)
  lines.push(`  .method("${req.method}", ${hasBodyFlag ? 'body' : 'null'})`)
  for (const [k, v] of Object.entries(hdrs)) lines.push(`  .addHeader("${k}", "${v}")`)
  lines.push('  .build();', '', 'Response response = client.newCall(request).execute();', 'System.out.println(response.body().string());')
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Builder: Java Unirest — structural token: "Unirest."
// ---------------------------------------------------------------------------

function buildJavaUnirest(req: ResolvedRequest): string {
  const hdrs = headersMap(req)
  const method = req.method.charAt(0) + req.method.slice(1).toLowerCase()
  const lines: string[] = ['import kong.unirest.Unirest;', '', `var response = Unirest.${method}("${req.url}")`]
  for (const [k, v] of Object.entries(hdrs)) lines.push(`  .header("${k}", "${v}")`)
  if (hasBody(req) && req.body.content) {
    if (req.body.type === 'json') lines.push(`  .body("${req.body.content.replace(/"/g, '\\"')}")`)
    else lines.push(`  .field("data", "${req.body.content.replace(/"/g, '\\"')}")`)
  }
  lines.push('  .asString();', '', 'System.out.println(response.getBody());')
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Builder: C# HttpClient — structural token: "HttpClient"
// ---------------------------------------------------------------------------

function buildCsharpHttpClient(req: ResolvedRequest): string {
  const hdrs = headersMap(req)
  const hasBodyFlag = hasBody(req) && req.body.content
  const methodTitle = req.method.charAt(0) + req.method.slice(1).toLowerCase()
  const lines: string[] = [
    'using System.Net.Http;',
    'using System.Text;',
    '',
    'var client = new HttpClient();',
  ]
  for (const [k, v] of Object.entries(hdrs)) lines.push(`client.DefaultRequestHeaders.Add("${k}", "${v}");`)
  if (hasBodyFlag) {
    const mt = req.body.type === 'json' ? 'application/json' : 'application/x-www-form-urlencoded'
    lines.push(`var content = new StringContent("${req.body.content.replace(/"/g, '\\"')}", Encoding.UTF8, "${mt}");`)
    lines.push(`var response = await client.${methodTitle}Async("${req.url}", content);`)
  } else {
    lines.push(`var response = await client.${methodTitle}Async("${req.url}");`)
  }
  lines.push('var result = await response.Content.ReadAsStringAsync();', 'Console.WriteLine(result);')
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Builder: Rust reqwest — structural token: "reqwest::"
// ---------------------------------------------------------------------------

function buildRustReqwest(req: ResolvedRequest): string {
  const hdrs = headersMap(req)
  const lines: string[] = [
    'use reqwest::Error;',
    '',
    '#[tokio::main]',
    'async fn main() -> Result<(), Error> {',
    '    let client = reqwest::Client::new();',
    `    let response = client.${req.method.toLowerCase()}("${req.url}")`,
  ]
  for (const [k, v] of Object.entries(hdrs)) lines.push(`        .header("${k}", "${v}")`)
  if (hasBody(req) && req.body.content) {
    if (req.body.type === 'json') lines.push(`        .json(&serde_json::json!(${req.body.content}))`)
    else lines.push(`        .body("${req.body.content.replace(/"/g, '\\"')}")`)
  }
  lines.push('        .send()', '        .await?;', '    println!("{}", response.text().await?);', '    Ok(())', '}')
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Builder: Node.js node-fetch — structural token: "node-fetch"
// ---------------------------------------------------------------------------

function buildNodeFetch(req: ResolvedRequest): string {
  const hdrs = headersMap(req)
  const options: Record<string, unknown> = { method: req.method }
  if (Object.keys(hdrs).length > 0) options.headers = hdrs
  if (hasBody(req) && req.body.content) {
    if (req.body.type === 'json') {
      const h = options.headers as Record<string, string> | undefined
      if (!h?.['Content-Type']) {
        if (!options.headers) options.headers = {}
        ;(options.headers as Record<string, string>)['Content-Type'] = 'application/json'
      }
    }
    options.body = req.body.content
  }
  return [
    "import fetch from 'node-fetch'; // npm install node-fetch",
    '',
    `const response = await fetch('${req.url}', ${JSON.stringify(options, null, 2)});`,
    '',
    'const data = await response.json();',
    'console.log(data);',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Builder: got (Node.js) — structural token: "got."
// ---------------------------------------------------------------------------

function buildGot(req: ResolvedRequest): string {
  const hdrs = headersMap(req)
  const options: Record<string, unknown> = {}
  if (Object.keys(hdrs).length > 0) options.headers = hdrs
  if (hasBody(req) && req.body.content) {
    if (req.body.type === 'json') {
      try { options.json = JSON.parse(req.body.content) } catch { options.body = req.body.content }
    } else {
      options.body = req.body.content
    }
  }
  return [
    "import got from 'got'; // npm install got",
    '',
    `const response = await got.${req.method.toLowerCase()}('${req.url}', ${JSON.stringify(options, null, 2)});`,
    '',
    'console.log(response.body);',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Builder: ky (browser/Deno/Node) — structural token: "ky."
// ---------------------------------------------------------------------------

function buildKy(req: ResolvedRequest): string {
  const hdrs = headersMap(req)
  const options: Record<string, unknown> = {}
  if (Object.keys(hdrs).length > 0) options.headers = hdrs
  if (hasBody(req) && req.body.content) {
    if (req.body.type === 'json') {
      try { options.json = JSON.parse(req.body.content) } catch { options.body = req.body.content }
    } else {
      options.body = req.body.content
    }
  }
  const optStr = Object.keys(options).length > 0 ? `, ${JSON.stringify(options, null, 2)}` : ''
  return [
    "import ky from 'ky'; // npm install ky",
    '',
    `const data = await ky.${req.method.toLowerCase()}('${req.url}'${optStr}).json();`,
    '',
    'console.log(data);',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Builder: Swift URLSession — structural token: "URLSession"
// ---------------------------------------------------------------------------

function buildSwiftUrlSession(req: ResolvedRequest): string {
  const hdrs = headersMap(req)
  const hasBodyFlag = hasBody(req) && req.body.content
  const lines: string[] = [
    'import Foundation',
    '',
    `var request = URLRequest(url: URL(string: "${req.url}")!)`,
    `request.httpMethod = "${req.method}"`,
  ]
  for (const [k, v] of Object.entries(hdrs)) lines.push(`request.setValue("${v}", forHTTPHeaderField: "${k}")`)
  if (hasBodyFlag) {
    lines.push('request.httpBody = Data("""', req.body.content, '""".utf8)')
  }
  lines.push('', 'let (data, _) = try await URLSession.shared.data(for: request)', 'print(String(data: data, encoding: .utf8)!)')
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Builder: Kotlin OkHttp — structural token: "OkHttpClient"
// ---------------------------------------------------------------------------

function buildKotlinOkHttp(req: ResolvedRequest): string {
  const hdrs = headersMap(req)
  const hasBodyFlag = hasBody(req) && req.body.content
  const lines: string[] = [
    'import okhttp3.OkHttpClient',
    'import okhttp3.Request',
    ...(hasBodyFlag ? ['import okhttp3.RequestBody.Companion.toRequestBody', 'import okhttp3.MediaType.Companion.toMediaType'] : []),
    '',
    'val client = OkHttpClient()',
    '',
  ]
  if (hasBodyFlag) {
    const mt = req.body.type === 'json' ? 'application/json' : 'application/x-www-form-urlencoded'
    lines.push(`val mediaType = "${mt}".toMediaType()`)
    lines.push(`val body = """${req.body.content}""".toRequestBody(mediaType)`)
    lines.push('')
  }
  lines.push('val request = Request.Builder()')
  lines.push(`  .url("${req.url}")`)
  for (const [k, v] of Object.entries(hdrs)) lines.push(`  .addHeader("${k}", "${v}")`)
  lines.push(`  .${req.method.toLowerCase()}(${hasBodyFlag ? 'body' : ''})`)
  lines.push('  .build()', '', 'val response = client.newCall(request).execute()', 'println(response.body?.string())')
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Builder: Dart http — structural token: "http.Request"
// ---------------------------------------------------------------------------

function buildDartHttp(req: ResolvedRequest): string {
  const hdrs = headersMap(req)
  const hasBodyFlag = hasBody(req) && req.body.content
  const lines: string[] = [
    "import 'package:http/http.dart' as http;",
    '',
    'Future<void> main() async {',
    `  final uri = Uri.parse('${req.url}');`,
  ]
  if (hasBodyFlag) {
    lines.push(`  final request = http.Request('${req.method}', uri);`)
    for (const [k, v] of Object.entries(hdrs)) lines.push(`  request.headers['${k}'] = '${v}';`)
    lines.push(`  request.body = '${req.body.content.replace(/'/g, "\\'")}';`)
    lines.push('  final response = await request.send();', '  print(await response.stream.bytesToString());')
  } else {
    const hdrParam = Object.keys(hdrs).length > 0 ? `, headers: ${JSON.stringify(hdrs)}` : ''
    lines.push(`  final response = await http.${req.method.toLowerCase()}(uri${hdrParam});`, '  print(response.body);')
  }
  lines.push('}')
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Builder: R httr — structural token: "httr::"
// ---------------------------------------------------------------------------

function buildRHttr(req: ResolvedRequest): string {
  const hdrs = headersMap(req)
  const method = req.method.charAt(0) + req.method.slice(1).toLowerCase()
  const hdrStr = Object.keys(hdrs).length > 0
    ? `add_headers(${Object.entries(hdrs).map(([k, v]) => `"${k}" = "${v}"`).join(', ')}), `
    : ''
  const lines: string[] = ['library(httr)', '']
  if (hasBody(req) && req.body.content) {
    const encode = req.body.type === 'json' ? 'json' : 'form'
    const bodyStr = req.body.type === 'json'
      ? `body = '${req.body.content.replace(/'/g, "\\'")}'`
      : `body = list(${req.body.content})`
    lines.push(`response <- httr::${method}("${req.url}", ${hdrStr}${bodyStr}, encode = "${encode}")`)
  } else {
    const hdrArg = hdrStr ? `, ${hdrStr.slice(0, -2)}` : ''
    lines.push(`response <- httr::${method}("${req.url}"${hdrArg})`)
  }
  lines.push('', 'print(content(response, "text"))')
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Builder: PowerShell Invoke-WebRequest — structural token: "Invoke-WebRequest"
// ---------------------------------------------------------------------------

function buildPowerShell(req: ResolvedRequest): string {
  const hdrs = headersMap(req)
  const lines: string[] = []
  if (Object.keys(hdrs).length > 0) {
    lines.push('$headers = @{')
    for (const [k, v] of Object.entries(hdrs)) lines.push(`  "${k}" = "${v}"`)
    lines.push('}', '')
  }
  const hdrParam = Object.keys(hdrs).length > 0 ? ' -Headers $headers' : ''
  if (hasBody(req) && req.body.content) {
    lines.push(`$body = @'`, req.body.content, `'@`, '')
    lines.push(`$response = Invoke-WebRequest -Uri "${req.url}" -Method ${req.method}${hdrParam} -Body $body`)
  } else {
    lines.push(`$response = Invoke-WebRequest -Uri "${req.url}" -Method ${req.method}${hdrParam}`)
  }
  lines.push('', '$response.Content')
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a code snippet for the given request in the specified target language.
 *
 * Steps:
 *   1. Apply variable substitution from activeEnv to all request fields.
 *   2. Inject Authorization header based on auth type (bearer with valid non-expired JWT,
 *      or basic with base64-encoded credentials).
 *   3. Delegate to the appropriate pure builder function for the target.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.7
 */
export function generateSnippet(
  request: Request,
  activeEnv: Environment | null,
  target: CodeTarget,
): string {
  const resolved = resolveRequest(request, activeEnv)
  switch (target) {
    // Original five
    case 'curl':                         return buildCurl(resolved)
    case 'php-curl':                     return buildPhpCurl(resolved)
    case 'laravel':                      return buildLaravel(resolved)
    case 'js-fetch':                     return buildJsFetch(resolved)
    case 'axios':                        return buildAxios(resolved)
    // Backend languages
    case 'python-requests':              return buildPythonRequests(resolved)
    case 'python-httpx':                 return buildPythonHttpx(resolved)
    case 'ruby-net-http':                return buildRubyNetHttp(resolved)
    case 'ruby-faraday':                 return buildRubyFaraday(resolved)
    case 'go-net-http':                  return buildGoNetHttp(resolved)
    case 'java-okhttp':                  return buildJavaOkHttp(resolved)
    case 'java-unirest':                 return buildJavaUnirest(resolved)
    case 'csharp-httpclient':            return buildCsharpHttpClient(resolved)
    case 'rust-reqwest':                 return buildRustReqwest(resolved)
    // JavaScript ecosystem
    case 'node-fetch':                   return buildNodeFetch(resolved)
    case 'got':                          return buildGot(resolved)
    case 'ky':                           return buildKy(resolved)
    // Mobile
    case 'swift-urlsession':             return buildSwiftUrlSession(resolved)
    case 'kotlin-okhttp':                return buildKotlinOkHttp(resolved)
    // Other
    case 'dart-http':                    return buildDartHttp(resolved)
    case 'r-httr':                       return buildRHttr(resolved)
    case 'powershell-invoke-webrequest': return buildPowerShell(resolved)
  }
}
