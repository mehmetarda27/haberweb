export default function handler(req, res) {
  return res.status(200).json({
    ok: true,
    route: "ping",
    message: "Vercel API route is working"
  });
}
