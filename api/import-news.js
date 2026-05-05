export default function handler(req, res) {
  return res.status(200).json({
    ok: true,
    route: "import-news",
    message: "Import news API route is working"
  });
}
