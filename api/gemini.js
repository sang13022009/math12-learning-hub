// Vercel Node Function. Keep GEMINI_API_KEY server-side only.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-3.7-flash';
  if (!apiKey) return res.status(503).json({ error: 'GEMINI_API_KEY chưa được cấu hình trên server.' });

  try {
    const { action, prompt, context = {} } = req.body || {};
    if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'Thiếu prompt.' });

    const videoUrl = context.resources?.V || context.resources?.S || null;
    const contextText = [
      'Bạn là AI Tutor Toán 12 Việt Nam, ưu tiên tính chính xác và bám nội dung bài học.',
      'Không bịa nội dung từ tài liệu mà bạn chưa đọc được. Nếu thiếu dữ kiện, nói rõ giới hạn.',
      'Trình bày bằng tiếng Việt, công thức rõ ràng, hướng tới học sinh ôn thi THPT.',
      `Chương: ${context.chapter || 'Không rõ'}`,
      `Bài: ${context.group || 'Không rõ'}`,
      `Tiết: ${context.lesson || 'Không rõ'}`,
      `Yêu cầu: ${prompt}`,
      action === 'quiz' ? 'Với trắc nghiệm, luôn ghi đáp án và giải thích sau từng câu.' : ''
    ].filter(Boolean).join('\n');

    const parts = [{ text: contextText }];
    // Gemini supports public YouTube URLs as video input. This lets summary/quiz use the real lecture.
    if (videoUrl && /(?:youtube\.com|youtu\.be)/i.test(videoUrl)) {
      parts.unshift({ file_data: { file_uri: normalizeYouTubeUrl(videoUrl) } });
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({ contents: [{ role: 'user', parts }] })
    });

    const payload = await response.json();
    if (!response.ok) {
      const message = payload?.error?.message || `Gemini HTTP ${response.status}`;
      return res.status(response.status).json({ error: message });
    }

    const text = (payload.candidates || [])
      .flatMap(candidate => candidate?.content?.parts || [])
      .map(part => part?.text || '')
      .filter(Boolean)
      .join('\n')
      .trim();

    if (!text) return res.status(502).json({ error: 'Gemini không trả văn bản.' });
    return res.status(200).json({ text, model });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Gemini endpoint failed.' });
  }
};

function normalizeYouTubeUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) {
      const id = parsed.pathname.split('/').filter(Boolean)[0];
      return id ? `https://www.youtube.com/watch?v=${id}` : url;
    }
    const id = parsed.searchParams.get('v');
    return id ? `https://www.youtube.com/watch?v=${id}` : url;
  } catch {
    return url;
  }
}
