export default function Offline() {
  return (
    <div className="page stack" style={{ maxWidth: 420, textAlign: "center", paddingTop: 80 }}>
      <h1 style={{ fontSize: 26 }}>You&apos;re offline</h1>
      <p className="muted">Check your Wi-Fi or mobile data, then try again. Your orders are safe: nothing is lost.</p>
      <a className="btn" href="">
        Try again
      </a>
    </div>
  );
}
