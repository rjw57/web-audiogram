import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";

const decodeAudioData = (buffer: ArrayBuffer, audioCtx?: BaseAudioContext) =>
  new Promise((resolve, reject) =>
    (audioCtx ?? new AudioContext()).decodeAudioData(buffer, resolve, reject),
  );

const doIt = async () => {
  const response = await fetch("audio/nonaspr-cnuts-song-all.mp3");

  if (!response.ok) {
    throw new Error(`Error fetching audio data: ${response.statusText}`);
  }

  const decodedData = await decodeAudioData(await response.arrayBuffer());
  console.log(decodedData);
};

const App = () => {
  return (
    <Container maxWidth="sm">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" sx={{ mb: 2 }}>
          WebAudio Experiments
        </Typography>
        <Button
          variant="contained"
          size="large"
          onClick={() => {
            doIt();
          }}
        >
          Load audio
        </Button>
      </Box>
    </Container>
  );
};

export default App;
