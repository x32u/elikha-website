import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const clean = (value: unknown, max = 200) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const authHeader = request.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError || !authData.user) return json({ error: "Authentication required." }, 401);
    const { data: profile } = await client.from("users").select("role").eq("id", authData.user.id).maybeSingle();
    if (!["teacher", "admin", "superadmin"].includes(String(profile?.role || "").toLowerCase())) {
      return json({ error: "Teacher access required." }, 403);
    }

    const body = await request.json();
    const instructions = clean(body?.instructions, 4000);
    const targets = (Array.isArray(body?.targets) ? body.targets : []).slice(0, 40).map((item: Record<string, unknown>) => ({
      type: item?.type === "object" ? "object" : "model",
      id: clean(item?.id, 160), label: clean(item?.label || item?.id, 120),
    })).filter((item: { id: string }) => item.id);
    const seenColors = new Set<string>();
    const colors = (Array.isArray(body?.colors) ? body.colors : []).slice(0, 10).map((item: Record<string, unknown>) => ({
      name: clean(item?.name, 40).toLowerCase(), hex: clean(item?.hex, 7).toUpperCase(),
    })).filter((item: { name: string; hex: string }) => {
      if (!/^#[0-9A-F]{6}$/.test(item.hex) || seenColors.has(item.hex)) return false;
      seenColors.add(item.hex); return true;
    });
    if (!instructions || !targets.length || !colors.length) return json({ requirements: [] });

    const apiKey = Deno.env.get("GROQ_API_KEY") || "";
    if (!apiKey) return json({ error: "AI instruction analysis is not configured." }, 503);
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("GROQ_MODEL") || "qwen/qwen3.6-27b",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Extract only explicit target-color requirements for a child AR activity. Never invent a target or color. Return JSON only: {\"requirements\":[{\"targetKey\":\"type:id\",\"colorHex\":\"#RRGGBB\"}]}." },
          { role: "user", content: JSON.stringify({ instructions, allowedTargets: targets.map((target: { type: string; id: string; label: string }) => ({ key: `${target.type}:${target.id}`, label: target.label })), allowedColors: colors }) },
        ],
      }),
    });
    if (!response.ok) return json({ error: "AI instruction analysis failed." }, 502);
    const payload = await response.json();
    const parsed = JSON.parse(payload?.choices?.[0]?.message?.content || "{}");
    const targetMap = new Map(targets.map((target: { type: string; id: string; label: string }) => [`${target.type}:${target.id}`, target]));
    const colorMap = new Map(colors.map((color: { name: string; hex: string }) => [color.hex, color]));
    const seen = new Set<string>();
    const requirements = (Array.isArray(parsed?.requirements) ? parsed.requirements : []).map((item: Record<string, unknown>) => {
      const target = targetMap.get(clean(item?.targetKey, 180));
      const color = colorMap.get(clean(item?.colorHex, 7).toUpperCase());
      if (!target || !color) return null;
      const key = `${target.type}:${target.id}:${color.hex}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return { targetType: target.type, targetId: target.id, targetLabel: target.label, colorHex: color.hex, colorName: color.name || color.hex };
    }).filter(Boolean).slice(0, 24);
    return json({ requirements });
  } catch (error) {
    console.error("analyze-activity-instructions", error);
    return json({ error: "Could not analyze these instructions." }, 500);
  }
});
