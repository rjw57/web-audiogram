import { useMemo } from "react";

import useMediaQuery from "@mui/material/useMediaQuery";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";

import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";

import createTheme from "./theme";
import GenerateAudiogram from "./GenerateAudiogram";

const App = () => {
  const prefersDarkMode = useMediaQuery("(prefers-color-scheme: dark)");
  const supportsWebCodecs = "VideoEncoder" in window;
  const theme = useMemo(() => createTheme(prefersDarkMode), [prefersDarkMode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="sm">
        <Box sx={{ my: 4 }}>
          {supportsWebCodecs ? (
            <GenerateAudiogram />
          ) : (
            <Box sx={{ textAlign: "center" }}>
              <Typography variant="body1" component="p" sx={{ mb: 2 }}>
                <strong>
                  Sorry, your browser does not yet support the WebCodecs API.
                </strong>
              </Typography>
              <Typography variant="body1" component="p">
                See{" "}
                <Link href="https://caniuse.com/webcodecs">
                  a list of supported browsers
                </Link>{" "}
                on caniuse.com.
              </Typography>
            </Box>
          )}
        </Box>
      </Container>
    </ThemeProvider>
  );
};

export default App;
