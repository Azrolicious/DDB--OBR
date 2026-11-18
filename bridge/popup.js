const api = globalThis.browser ?? globalThis.chrome;

const dot = document.getElementById("dot");
const text = document.getElementById("text");
const hint = document.getElementById("hint");
const sites = document.getElementById("sites");

for (const cs of api.runtime.getManifest().content_scripts ?? []) {
  for (const match of cs.matches ?? []) {
    const li = document.createElement("li");
    li.textContent = match;
    sites.append(li);
  }
}

api.runtime
  .sendMessage({ op: "status", params: {} })
  .then((response) => {
    if (response?.ok && response.data?.loggedIn) {
      dot.className = "dot ok";
      text.textContent = `Connected to D&D Beyond${response.data.username ? ` as ${response.data.username}` : ""}`;
      hint.textContent = "Open your Owlbear Rodeo room; the DDB-OBR panel will show a green dot.";
    } else {
      dot.className = "dot warn";
      text.textContent = "Not logged in to D&D Beyond";
      hint.innerHTML = 'Sign in at <a href="https://www.dndbeyond.com/sign-in" target="_blank" rel="noopener">dndbeyond.com</a> in this browser, then reopen this popup.';
    }
  })
  .catch((error) => {
    dot.className = "dot warn";
    text.textContent = "Couldn't check status";
    hint.textContent = String(error?.message ?? error);
  });
