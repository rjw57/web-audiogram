import { useRef } from "react";

import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";

import { renderAudiogram } from "./audiogram";
import { fetchAndDemuxVideo } from "./decode";

const DEFAULT_SAMPLE_RATE = 44100;

/**
 * Wrapper around fetch() which decodes data fetched into an AudioBuffer.
 */
const fetchAndDecodeAudioData = async (...args: Parameters<typeof fetch>) => {
  const response = await fetch(...args);
  if (!response.ok) {
    throw new Error(`Error fetching audio data: ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  return new Promise<AudioBuffer>((resolve, reject) =>
    new OfflineAudioContext(1, 1, DEFAULT_SAMPLE_RATE).decodeAudioData(
      buffer,
      resolve,
      reject,
    ),
  );
};

const doIt = async (videoEl: HTMLVideoElement) => {
  // Fetch audio and background video data.
  const [decodedAudioBuffer, { encodedVideoChunks, videoTrack }] = await Promise.all([
    fetchAndDecodeAudioData("audio/nonaspr-cnuts-song-all.mp3"),
    fetchAndDemuxVideo("background/yellow-motes.mp4"),
  ]);

  if(encodedVideoChunks.length === 0) {
    throw new Error("No background video was found.");
  }

  // console.log(videoTrack);
  // console.log(encodedVideoChunks);

  const encodedMediaBuffer = await renderAudiogram(decodedAudioBuffer, {
    width: videoEl.width,
    height: videoEl.height,
    videoFrameRate: 30,
  });

  const blob = new Blob([encodedMediaBuffer]);
  videoEl.src = URL.createObjectURL(blob);
  videoEl.play();
};

const App = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  return (
    <Container maxWidth="sm">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" sx={{ mb: 2 }}>
          WebAudio Experiments
        </Typography>
        <Typography variant="body1" component="p" sx={{ mb: 2 }}>
          Chrome only for the moment, sorry :(.
        </Typography>
        <Button
          variant="contained"
          size="large"
          onClick={() => {
            videoRef.current && doIt(videoRef.current);
          }}
        >
          Load audio
        </Button>
        <p>
          <video controls ref={videoRef} width={640} height={320} />
        </p>
      </Box>
    </Container>
  );
};

export default App;
