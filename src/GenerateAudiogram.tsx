import { useState } from "react";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import LinearProgress from "@mui/material/LinearProgress";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";

import { MuiColorInput } from "mui-color-input";

import { renderAudiogram, Status } from "./audiogram";

const GenerateAudiogram = () => {
  const [barColor, setBarColor] = useState("#ff0000");
  const [status, setStatus] = useState<Status>();
  const [encodedMediaBuffer, setEncodedMediaBuffer] = useState<ArrayBuffer>();
  const width = 640,
    height = 320;

  const handleClick = () =>
    (async () => {
      setEncodedMediaBuffer(undefined);
      setEncodedMediaBuffer(
        await renderAudiogram({
          audioUrl: "audio/nonaspr-cnuts-song-all.mp3",
          backgroundVideoUrl: "background/yellow-motes.mp4",
          width,
          height,
          onStatus: setStatus,
          barFillStyle: barColor,
        }),
      );
    })();

  const videoRefCallback = (videoEl: HTMLVideoElement | null) => {
    if (!encodedMediaBuffer || !videoEl) {
      return;
    }
    const blob = new Blob([encodedMediaBuffer]);
    videoEl.src = URL.createObjectURL(blob);
    videoEl.play();
  };

  const isEncoding = status && status.state !== "completed";
  const progressPercentage = status?.progressPercentage;

  return (
    <>
      <Typography variant="h4" component="h1" gutterBottom>
        Audiogram
      </Typography>
      <Typography variant="body1" component="p" gutterBottom>
        An experiment at generating and encoding video within the browser using
        the WebCodecs API.
      </Typography>
      <Box
        component="form"
        noValidate
        autoComplete="off"
        display="flex"
        flexDirection="column"
        gap={2}
        sx={{ mt: 2 }}
      >
        <MuiColorInput
          disabled={isEncoding}
          format="hex"
          fullWidth
          label="Bar color"
          onChange={setBarColor}
          value={barColor}
        />
        <Button
          variant="contained"
          size="large"
          disabled={isEncoding}
          onClick={handleClick}
        >
          Generate audiogram
        </Button>
      </Box>
      <Box component="p" sx={{ mt: 2 }}>
        {isEncoding && (
          <LinearProgress
            variant={
              typeof progressPercentage == "undefined"
                ? "indeterminate"
                : "determinate"
            }
            value={progressPercentage}
          />
        )}
        {encodedMediaBuffer && (
          <>
            <video
              style={{
                width: width,
                height: "auto",
                maxWidth: "100%",
                margin: "auto",
                aspectRatio: width / height,
              }}
              controls
              ref={videoRefCallback}
              width={width}
              height={height}
            />
            <Box sx={{ mt: 1 }}>
              <Button
                variant="outlined"
                onClick={() => {
                  setEncodedMediaBuffer(undefined);
                }}
              >
                Clear
              </Button>
            </Box>
          </>
        )}
      </Box>
    </>
  );
};

export default GenerateAudiogram;
