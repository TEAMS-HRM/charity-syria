import { Controller, Get, Header } from "@nestjs/common";

@Controller()
export class WebController {
  @Get("landing")
  @Header("Content-Type", "text/html; charset=utf-8")
  landing(): string {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Landing moved</title>
  <style>
    body { margin: 0; font-family: "Segoe UI", Tahoma, Arial, sans-serif; background: #f7f3ec; color: #2a241d; }
    .box { width: min(760px, calc(100vw - 32px)); margin: 56px auto; background: #fffdf9; border: 1px solid #d8cebe; border-radius: 14px; padding: 20px; }
    a { color: #0d5d77; font-weight: 700; }
  </style>
</head>
<body>
  <main class="box">
    <h1>Landing page moved</h1>
    <p>The legacy backend landing at <strong>/landing</strong> is retired.</p>
    <p>Use the new frontend landing at <a href="http://localhost:5173/">http://localhost:5173/</a>.</p>
  </main>
</body>
</html>`;
  }

  @Get("admin")
  @Header("Content-Type", "text/html; charset=utf-8")
  admin(): string {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Admin moved</title>
  <style>
    body { margin: 0; font-family: "Segoe UI", Tahoma, Arial, sans-serif; background: #f7f3ec; color: #2a241d; }
    .box { width: min(760px, calc(100vw - 32px)); margin: 56px auto; background: #fffdf9; border: 1px solid #d8cebe; border-radius: 14px; padding: 20px; }
    a { color: #0d5d77; font-weight: 700; }
  </style>
</head>
<body>
  <main class="box">
    <h1>Admin page moved</h1>
    <p>The legacy backend admin page at <strong>/admin</strong> is retired.</p>
    <p>Use the new Arabic admin page at <a href="http://localhost:5173/admin">http://localhost:5173/admin</a>.</p>
  </main>
</body>
</html>`;
  }
}
