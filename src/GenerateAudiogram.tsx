import { useState, useEffect } from "react";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";

import { MuiColorInput } from "mui-color-input";

import { renderAudiogram, Status } from "./audiogram";

const GenerateAudiogram = () => {
  const [barColor, setBarColor] = useState("#ff0000");
  const [status, setStatus] = useState<Status>();
  const [encodedMediaBuffer, setEncodedMediaBuffer] = useState<ArrayBuffer>();
  const [encodedMediaURL, setEncodedMediaURL] = useState<string>();

  useEffect(() => {
    if (!encodedMediaBuffer) {
      setEncodedMediaURL(undefined);
      return;
    }
    const blob = new Blob([encodedMediaBuffer]);
    setEncodedMediaURL(URL.createObjectURL(blob));
  }, [encodedMediaBuffer]);

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
      <Box sx={{ mt: 2 }}>
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
        {encodedMediaURL && (
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
              autoPlay
              src={encodedMediaURL}
              width={width}
              height={height}
            />
            <Box sx={{ mt: 1 }} display="flex" gap={2}>
              <Button
                sx={{ flexGrow: 1 }}
                variant="outlined"
                onClick={() => {
                  setEncodedMediaBuffer(undefined);
                }}
              >
                Clear
              </Button>
              <Button
                sx={{ flexGrow: 1 }}
                variant="contained"
                download="audiogram.webm"
                href={encodedMediaURL}
              >
                Download
              </Button>
            </Box>
          </>
        )}
      </Box>
    </>
  );
};

export default GenerateAudiogram;
