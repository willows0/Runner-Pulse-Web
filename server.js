import http from "node:http";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
const base=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||3000);
const GARMIN_API_KEY = process.env.GARMIN_API_KEY;
const files={"/":"index.html","/index.html":"index.html","/app.js":"app.js","/style.css":"style.css"};
const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8"};
http.createServer(async(req,res)=>{
 const pathname=new URL(req.url,"http://localhost").pathname;
 if(pathname==="/api/status"){res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify({garminConfigured:Boolean(process.env.GARMIN_API_KEY),garminConnected:false,message:"La connessione Garmin non è ancora attivata: occorre verificare endpoint e autorizzazioni della Personal API."}));return;}
if (pathname === "/api/garmin/test") {
  if (req.method !== "POST") {
  res.writeHead(405, { "Allow": "POST" });
  res.end("Method not allowed");
  return;
}
 if (
  !process.env.GARMIN_TEST_SECRET ||
req.headers["x-garmin-test-secret"] !== process.env.GARMIN_TEST_SECRET
) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  try {
    const token = await getGarminToken();

    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    });

    res.end(JSON.stringify({
      garminConnected: true,
      message: "Garmin ha accettato la chiave API"
    }));
  } catch (error) {
    console.error("Errore autenticazione Garmin:", error.message);

    res.writeHead(502, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    });

    res.end(JSON.stringify({
      garminConnected: false,
      message: "Autenticazione Garmin non riuscita"
    }));
  }
  return;
}


    

if (pathname === "/api/garmin/activities") {
  if (req.method !== "POST") {
    res.writeHead(405, { "Allow": "POST" });
    res.end("Method not allowed");
    return;
  }

  if (
    !process.env.GARMIN_TEST_SECRET ||
    req.headers["x-garmin-test-secret"] !== process.env.GARMIN_TEST_SECRET
  ) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  try {
    const activities = await getGarminActivities();

    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    });

    res.end(JSON.stringify({
      success: true,
      count: activities.length,
      activities
    }));
  } catch (error) {
    console.error("Errore attività Garmin:", error.message);

    res.writeHead(502, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    });

    res.end(JSON.stringify({
      success: false,
      message: "Impossibile recuperare le attività Garmin"
    }));
  }
  return;
}
const name = files[pathname];
if (!name) {
  res.writeHead(404);
  res.end("Not found");
  return;
}

try {
  const data = await readFile(path.join(base, "public", name));
  res.writeHead(200, {
    "Content-Type": types[path.extname(name)],
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store"
  });
  res.end(data);
} catch {
  res.writeHead(500);
  res.end("Server error");
}
}).listen(port, "0.0.0.0", () => console.log("Runner Pulse Web on " + port));

const GARMIN_TOKEN_URL =
  "https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token";
 async function getGarminToken() {
  if (!GARMIN_API_KEY) {
    throw new Error("Chiave Garmin non configurata");
  }
  }
  async function getGarminActivities() {
  const token = (await getGarminToken()).trim();

  const url = new URL(
    "https://personal.connectapi.garmin.com/activitylist-service/activities/search/activities"
  );

  url.searchParams.set("start", "0");
  url.searchParams.set("limit", "20");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Errore attività Garmin: HTTP ${response.status}`);
  }

  return await response.json();
}

  const response = await fetch(GARMIN_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `ApiKey ${GARMIN_API_KEY}`
    }
  });

  if (!response.ok) {
    throw new Error(`Errore Garmin: HTTP ${response.status}`);
  }
return await response.text();
}
