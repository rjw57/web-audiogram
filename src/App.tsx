const decodeAudioData = (audioCtx: BaseAudioContext, buffer: ArrayBuffer) => (
  new Promise((resolve, reject) => audioCtx.decodeAudioData(buffer, resolve, reject))
);

const doIt = async () => {
  const audioCtx = new AudioContext();
  const response = await fetch("audio/nonaspr-cnuts-song-all.mp3");

  if (!response.ok) {
    throw new Error(`Error fetching audio data: ${response.statusText}`);
  }

  const decodedData = await decodeAudioData(audioCtx, await response.arrayBuffer());
  console.log(decodedData);
};

const App = () => {
  return <div className="container mx-auto my-4">
    <button onClick={() => { doIt(); }}>do it</button>
  </div>;
};

export default App;
