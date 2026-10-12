<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/8ef2a301-8e1e-4ef1-a70d-f4a4649e368d

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Oyun Altyazısı Çevirisi

Masaüstü uygulamasında **Altyazı Çevirisi** sekmesini açın, **Ekran seç** ile oyun penceresini (veya oyunun bulunduğu ekranı) paylaşın ve önizlemede altyazı alanını sürükleyerek seçin. Kaynak dili belirleyip canlı çeviriyi başlattığınızda OCR cihazınızda çalışır; Türkçe çeviri oyunun ve diğer pencerelerin üzerinde sağ üstte yapışkan not gibi görünür. Not fare tıklamalarını engellemez; `Ctrl+Shift+Y` ile gösterilip gizlenebilir. Tam ekran özel modundaki oyunlarda görünürlük oyuna/Windows'a bağlı olabilir; pencere kenarlıksız tam ekran önerilir.

OCR dil modelleri ilk kullanımda indirilir. Görüntü OCR için cihazınızda kalır; algılanan altyazı metni, API anahtarı istemeyen ücretsiz Google Translate endpoint’ine internet üzerinden gönderilir. Bu endpoint'in erişilebilirliği ve kullanım koşulları değişebilir. Daha doğru tanıma için yalnızca altyazıları kapsayan dar bir ekran alanı seçin.

Çeviri penceresinin yatay/dikey konumu, genişliği, yüksekliği ve yazı boyutu Altyazı Çevirisi ekranından ayarlanabilir; tercihler cihazda saklanır. Varsayılan görünüm sağ üstte (%100 yatay, üstten %4), 400 × 510 piksel ve 17 piksel yazı boyutudur. OCR satır sonları çeviriye ve yapışkan nota korunarak aktarılır. Yapışkan notun kendisi ekran yakalama dışına alınır. Ekran 15 FPS ile alınır; seçilen altyazı bölgesindeki değişiklikler 100 ms'de bir küçük bir örnek görüntüyle kontrol edilir. Değişiklikte OCR hazır olur olmaz başlar, sabit görüntü tekrar taranmaz ve çeviri istekleri iptal edilmeden sırayla tamamlanır. Önizleme tüm ekran yerine yalnızca seçilen bölgeyi yeniler.
