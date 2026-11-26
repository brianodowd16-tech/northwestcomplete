import { clock, openShift } from "@round/db/growth";
import { staffById, venueById, venueBySlug, customerById } from "@round/db/services";
import { authenticationOptions, deviceName, finishAuthentication, finishRegistration, registrationOptions } from "@/lib/passkeys";
import { allow, clientIp } from "@/lib/ratelimit";
import { currentGuest, currentStaff, errorJson, json, startGuestSession, startStaffSession } from "@/lib/server";

/**
 * Passkeys for everyone, in two steps (options, then verify):
 *  - register: add a passkey to the signed-in guest or staff account
 *  - login: sign in with Face ID / Touch ID, Windows Hello, Android or a security key
 *  - clock: clock in or out on a shared device by proving who you are (no sign-in)
 */
export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { step?: string; purpose?: string; as?: string; venue?: string; response?: never };
    const kind: "staff" | "guest" = b.as === "staff" ? "staff" : "guest";
    const verify = b.step === "verify";
    if (!(await allow(`passkey:${await clientIp()}`, 60, 15 * 60_000))) return json({ error: "Too many attempts. Try again in a few minutes." }, 429);

    if (b.purpose === "register") {
      const staff = kind === "staff" ? await currentStaff() : null;
      const guest = kind === "guest" ? await currentGuest() : null;
      if (!staff && !guest) return json({ error: "Sign in first" }, 401);
      const owner = staff ? { kind, id: staff.id, name: staff.name, label: staff.email } : { kind, id: guest!.id, name: guest!.name, label: `${guest!.name} (Complete)` };
      if (!verify) return json(await registrationOptions(owner));
      await finishRegistration(owner, b.response!, deviceName(req.headers.get("user-agent")));
      return json({ message: "Passkey added. Next time, sign in with your face, fingerprint or PIN." });
    }

    if (b.purpose === "login") {
      if (!verify) return json(await authenticationOptions("login", kind));
      const id = await finishAuthentication("login", kind, b.response!);
      if (kind === "staff") {
        const staff = await staffById(id);
        if (!staff) return json({ error: "That account no longer exists" }, 401);
        await startStaffSession(staff.id);
        return json({ slug: (await venueById(staff.venueId)).slug, mustChangePassword: staff.mustChangePassword });
      }
      if (!(await customerById(id))) return json({ error: "That account no longer exists" }, 401);
      await startGuestSession(id);
      return json({ ok: true });
    }

    if (b.purpose === "clock") {
      const venue = await venueBySlug(String(b.venue ?? ""));
      if (!verify) return json(await authenticationOptions("clock", "staff"));
      const staff = await staffById(await finishAuthentication("clock", "staff", b.response!));
      if (!staff || staff.venueId !== venue.id) return json({ error: `That passkey isn't for ${venue.name}'s team` }, 403);
      const open = await openShift(staff);
      const shift = await clock(staff, open ? "out" : "in");
      const at = (open ? shift.clockOut! : shift.clockIn).toLocaleTimeString("en-IE", { timeZone: venue.timezone, hour: "2-digit", minute: "2-digit" });
      return json({ message: `${staff.name.split(" ")[0]}, you're clocked ${open ? "out" : "in"} at ${at}`, clockedIn: !open });
    }
    return json({ error: "Unknown request" }, 400);
  } catch (e) {
    return errorJson(e);
  }
}
