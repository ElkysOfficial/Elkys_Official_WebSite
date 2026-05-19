<?php
/**
 * Proxy do encurtador de links — lnk.elkys.com.br
 *
 * Repassa qualquer requisicao recebida no subdominio para a edge function
 * `track` do Supabase, preservando o caminho (/c/<slug> ou /o/<id>.gif).
 *
 * - Clique  (/c/<slug>):   a function responde 302; este proxy devolve o
 *   mesmo 302 ao navegador (NAO segue o redirect aqui).
 * - Abertura (/o/<id>.gif): a function responde o GIF 1x1; o proxy devolve
 *   a imagem com o mesmo Content-Type.
 *
 * O IP real e o User-Agent do visitante sao repassados para a function
 * registrar corretamente o evento em tracking_events.
 *
 * INSTALACAO (Hostinger):
 *   1. Painel Hostinger -> Dominios -> Subdominios -> criar `lnk`
 *      (resulta em lnk.elkys.com.br, com SSL gratuito).
 *   2. Subir este arquivo (index.php) e o .htaccess na pasta raiz do
 *      subdominio.
 *   3. Pronto — lnk.elkys.com.br/c/... e /o/... passam a funcionar.
 */

// URL base da edge function `track` no Supabase.
const FUNCTION_BASE = 'https://njubtnsgtjcfmbnvjuqr.supabase.co/functions/v1/track';

// URL de fallback caso o proxy falhe — nunca deixa o visitante na mao.
const FALLBACK_URL = 'https://elkys.com.br';

// Caminho recebido (ex.: /c/abc1234 ou /o/uuid.gif).
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if ($path === null || $path === '' || $path === '/') {
    header('Location: ' . FALLBACK_URL, true, 302);
    exit;
}

$target = FUNCTION_BASE . $path;

$ch = curl_init($target);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HEADER         => true,
    CURLOPT_FOLLOWLOCATION => false, // repassa o 302; nao segue aqui
    CURLOPT_TIMEOUT        => 10,
    CURLOPT_HTTPHEADER     => [
        'X-Forwarded-For: ' . ($_SERVER['REMOTE_ADDR'] ?? ''),
        'User-Agent: ' . ($_SERVER['HTTP_USER_AGENT'] ?? ''),
    ],
]);

$response = curl_exec($ch);

if ($response === false) {
    // Falha de rede: manda o visitante para o site em vez de erro.
    header('Location: ' . FALLBACK_URL, true, 302);
    exit;
}

$status     = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$rawHeaders = substr($response, 0, $headerSize);
$body       = substr($response, $headerSize);
curl_close($ch);

http_response_code($status);

// Repassa apenas os headers relevantes da resposta da function.
foreach (explode("\r\n", $rawHeaders) as $line) {
    if (preg_match('/^(Location|Content-Type|Cache-Control|Pragma|Expires):/i', $line)) {
        header($line, true);
    }
}

echo $body;
