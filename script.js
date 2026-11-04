const dictateButton = document.querySelector("#dictate");
const endDictationButton = document.querySelector("#endDictation");
const dictationStatus = document.querySelector("#dictationStatus");
const transcriptBox = document.querySelector("#transcript");

const formaliseButton = document.querySelector("#formalise");
const undoButton = document.querySelector("#undoFormalise");
const formaliseStatus = document.querySelector("#formaliseStatus");

const headlineInput = document.querySelector("#headline");
const generateButton = document.querySelector("#generate");
const postDraft = document.querySelector("#postDraft");
const draftStatus = document.querySelector("#draftStatus");
const copyPostButton = document.querySelector("#copyPost");

let originalText = null;

function resetFormalisation() {
  originalText = null;
  undoButton.disabled = true;
  formaliseStatus.textContent = "";
}

transcriptBox.addEventListener("input", resetFormalisation);

// LIVE DICTATION
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
  dictateButton.disabled = true;
  dictationStatus.textContent =
    "Speech recognition is unavailable. Try Chrome.";
} else {
  const recognition = new SpeechRecognition();

  recognition.lang = "en-NG";
  recognition.continuous = false;
  recognition.interimResults = true;

  let hadError = false;

  function restoreEditing() {
    dictateButton.disabled = false;
    endDictationButton.disabled = true;
    transcriptBox.readOnly = false;
    formaliseButton.disabled = false;
    undoButton.disabled = originalText === null;
    generateButton.disabled = false;
  }

  dictateButton.addEventListener("click", () => {
    hadError = false;
    dictateButton.disabled = true;
    transcriptBox.readOnly = true;
    formaliseButton.disabled = true;
    undoButton.disabled = true;
    generateButton.disabled = true;
    dictationStatus.textContent = "Starting dictation…";

    try {
      recognition.start();
    } catch (error) {
      restoreEditing();
      dictationStatus.textContent =
        "Could not start dictation. Refresh and try again.";
    }
  });

  recognition.addEventListener("start", () => {
    endDictationButton.disabled = false;
    dictationStatus.textContent = "Listening… speak your idea.";
  });

  recognition.addEventListener("result", (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        const words = event.results[i][0].transcript.trim();

        if (words) {
          resetFormalisation();
          transcriptBox.value +=
            (transcriptBox.value &&
            !/\s$/.test(transcriptBox.value) ? " " : "") + words;
          saveDraft();
          markVoiceInput();
        }
      }
    }
  });

  endDictationButton.addEventListener("click", () => {
    endDictationButton.disabled = true;
    dictationStatus.textContent = "Finishing dictation…";
    recognition.stop();
  });

  recognition.addEventListener("error", (event) => {
    hadError = true;
    dictationStatus.textContent =
      `Dictation error: ${event.error}. Check microphone permission and internet access.`;
  });

  recognition.addEventListener("end", () => {
    restoreEditing();

    if (!hadError) {
      dictationStatus.textContent =
        "Dictation stopped. You can edit or formalise your text.";
    }
  });

  window.addEventListener("pagehide", () => recognition.abort());
}

/// AI FORMALISATION
formaliseButton.addEventListener("click", async () => {
  const text = transcriptBox.value;

  if (!text.trim()) {
    formaliseStatus.textContent = "Dictate or type some text first.";
    return;
  }

  if (text.length > 6000) {
    formaliseStatus.textContent =
      "Please shorten your text to 6,000 characters or fewer.";
    return;
  }

  formaliseButton.disabled = true;
  formaliseButton.textContent = "Formalising…";
  dictateButton.disabled = true;
  undoButton.disabled = true;
  generateButton.disabled = true;
  transcriptBox.readOnly = true;

  formaliseStatus.textContent = "Improving your wording…";

  try {
    const response = await fetch("/api/formalise", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Formalisation failed.");
    }

    if (originalText === null) originalText = text;

    transcriptBox.value = data.text;
    saveDraft();
    formaliseStatus.textContent =
      "Text formalised. Review it before creating your draft.";
  } catch (error) {
    formaliseStatus.textContent = error.message;
  } finally {
    formaliseButton.disabled = false;
    formaliseButton.textContent = "Formalise text";
    dictateButton.disabled = !SpeechRecognition;
    undoButton.disabled = originalText === null;
    generateButton.disabled = false;
    transcriptBox.readOnly = false;
  }
});

undoButton.addEventListener("click", () => {
  if (originalText !== null) {
    transcriptBox.value = originalText;
    saveDraft();
    resetFormalisation();
    formaliseStatus.textContent = "Original text restored.";
  }
});

// CREATE AND COPY A DRAFT
generateButton.addEventListener("click", () => {
  const words = transcriptBox.value.trim();
  const headline = headlineInput.value.trim();

  if (!words) {
    draftStatus.textContent = "Dictate or type some notes first.";
    return;
  }

  if (
    postDraft.value.trim() &&
    !window.confirm("Replace your current draft?")
  ) {
    return;
  }

  postDraft.value = [headline, words].filter(Boolean).join("\n\n");
  saveDraft();
  markVoiceDraft();
  draftStatus.textContent = "Draft ready. Edit it before sharing.";
});

copyPostButton.addEventListener("click", async () => {
  if (!postDraft.value.trim()) {
    draftStatus.textContent = "Create a draft first.";
    return;
  }

  try {
    await navigator.clipboard.writeText(postDraft.value);
    draftStatus.textContent = "Post copied!";
  } catch (error) {
    postDraft.focus();
    postDraft.select();
    draftStatus.textContent =
      "Press Ctrl + C to copy the selected post.";
  }
});

// CHECK BUFFER CONNECTION
async function checkBufferConnection() {
  const status = document.querySelector("#bufferStatus");
  const connectLink = document.querySelector("#connectBuffer");

  try {
    const response = await fetch("/api/buffer/status", {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("Connection check failed.");
    }

    const data = await response.json();

    if (data.connected) {
      status.textContent = data.email
        ? `Connected to Buffer as ${data.email}.`
        : "Connected to Buffer.";

      connectLink.textContent = "Reconnect Buffer";
    } else {
      status.textContent = "Connect Buffer to publish your post.";
      connectLink.textContent = "Connect Buffer";
    }
  } catch (error) {
    status.textContent =
      "Could not check the Buffer connection. Refresh to try again.";
  }
}



 // LOAD CONNECTED SOCIAL ACCOUNTS
const channelStatus = document.querySelector("#channelStatus");
const socialAccountsContainer = document.querySelector("#socialAccounts");

async function loadChannels() {
  channelStatus.textContent = "Loading your connected accounts...";
  socialAccountsContainer.replaceChildren();

  try {
    const response = await fetch("/api/buffer/channels", {
      cache: "no-store"
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not load social accounts.");
    }

    if (!data.channels.length) {
      channelStatus.textContent =
        "No social accounts found. Connect your accounts through Buffer.";
      return;
    }

    for (const channel of data.channels) {
      const label = document.createElement("label");
      label.className = "social-account-option";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = channel.id;
      checkbox.name = "bufferChannel";

      label.appendChild(checkbox);
      label.append(
        ` ${channel.name} — ${channel.service} (${channel.organization})`
      );

      socialAccountsContainer.appendChild(label);
    }

    channelStatus.textContent =
      "Select the accounts you want to publish to.";
  } catch (error) {
    channelStatus.textContent = error.message;
  }
}

// Automatically load accounts when the page opens
// Load accounts only when Buffer is connected
async function initialiseBuffer() {
  await checkBufferConnection();

  const response = await fetch("/api/buffer/status", {
    cache: "no-store"
  });

  const data = await response.json();

  if (data.connected) {
    await loadChannels();
  }
}

initialiseBuffer();



 // POST NOW
const postNowButton = document.querySelector("#postNow");
const publishStatus = document.querySelector("#publishStatus");
let postingInProgress = false;

function updatePostButton() {
  postNowButton.disabled = postingInProgress;
}

function markVoiceInput() {
  publishStatus.textContent = "Voice recognised.";
  updatePostButton();
}

function markVoiceDraft() {
  publishStatus.textContent = "Draft ready.";
  updatePostButton();
}

postNowButton.addEventListener("click", async () => {
  if (postingInProgress) return;

  const text = postDraft.value.trim();

  if (!text) {
    publishStatus.textContent =
      "Enter or generate some post text before publishing.";
    return;
  }

  const selectedAccounts = [
    ...socialAccountsContainer.querySelectorAll(
      'input[name="bufferChannel"]:checked'
    )
  ];

  if (!selectedAccounts.length) {
    publishStatus.textContent =
      "Select at least one social account.";
    return;
  }

  const accountNames = selectedAccounts.map(
    checkbox => checkbox.closest("label").textContent.trim()
  );

  if (!window.confirm(
    `Publish now to:\n${accountNames.join("\n")}\n\n${text}`
  )) {
    return;
  }

  postingInProgress = true;
  updatePostButton();
  publishStatus.textContent = "Sending to Buffer...";

  try {
    for (const checkbox of selectedAccounts) {
      const response = await fetch("/api/buffer/post-now", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text,
          channelId: checkbox.value
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Posting failed."
        );
      }
    }

    publishStatus.textContent =
      "Buffer accepted your post for all selected accounts.";
  } catch (error) {
    publishStatus.textContent =
      `${error.message} Check Buffer before sending again.`;
  } finally {
    postingInProgress = false;
    updatePostButton();
  }
});

updatePostButton();


// Place Copy post and Post now beside each other.
const postActions = document.createElement("div");
postActions.className = "buttons";

copyPostButton.before(postActions);
postActions.append(copyPostButton, postNowButton);

postActions.style.marginTop = "12px";
copyPostButton.style.marginTop = "0";
postNowButton.style.marginTop = "0";

updatePostButton();