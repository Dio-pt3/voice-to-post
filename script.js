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
  recognition.continuous = true;
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

// SAVE AND RESTORE YOUR WORK
const draftStorageKey = "voice-to-post-draft-v1";

const saveStatus = document.createElement("p");
saveStatus.setAttribute("role", "status");
postDraft.after(saveStatus);

function saveDraft() {
  try {
    localStorage.setItem(draftStorageKey, JSON.stringify({
      transcript: transcriptBox.value,
      headline: headlineInput.value,
      post: postDraft.value
    }));

    saveStatus.textContent = "Saved in this browser.";
  } catch (error) {
    saveStatus.textContent =
      "Could not save automatically. Copy your post to keep it.";
  }
}

try {
  const saved = localStorage.getItem(draftStorageKey);

  if (saved) {
    const draft = JSON.parse(saved);

    if (typeof draft.transcript === "string") {
      transcriptBox.value = draft.transcript;
    }

    if (typeof draft.headline === "string") {
      headlineInput.value = draft.headline;
    }

    if (typeof draft.post === "string") {
      postDraft.value = draft.post;
    }

    saveStatus.textContent = "Your previous work was restored.";
  }
} catch (error) {
  saveStatus.textContent =
    "Previous work could not be restored.";
}

// Save when you type or edit.
for (const field of [transcriptBox, headlineInput, postDraft]) {
  field.addEventListener("input", saveDraft);
}

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

checkBufferConnection();

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
loadChannels();


// POST A DRAFT THAT STARTED WITH DICTATION
const postNowButton = document.querySelector("#postNow");
const publishStatus = document.querySelector("#publishStatus");

let hasDictatedText = false;
let draftFromDictation = false;
let postingInProgress = false;

function updatePostButton() {
  const ready =
    !postingInProgress &&
    draftFromDictation &&
    Boolean(postDraft.value.trim()) &&
    Boolean(channelSelect.value);

  postNowButton.disabled = !ready;

  if (!hasDictatedText) {
    postNowButton.title = "Dictate something first.";
  } else if (!draftFromDictation) {
    postNowButton.title = "Click Create draft after dictating.";
  } else if (!postDraft.value.trim()) {
    postNowButton.title = "Your post draft is empty.";
  } else if (!channelSelect.value) {
    postNowButton.title = "Select a social account.";
  } else {
    postNowButton.title = "Publish your reviewed draft now.";
  }
}

function markVoiceInput() {
  hasDictatedText = true;
  draftFromDictation = false;

  publishStatus.textContent =
    "Voice recognised. Create a draft when your wording is ready.";

  updatePostButton();
}

function markVoiceDraft() {
  draftFromDictation = hasDictatedText;

  publishStatus.textContent = draftFromDictation
    ? "Review your draft and select an account before posting."
    : "Dictate your idea first to unlock posting.";

  updatePostButton();
}

transcriptBox.addEventListener("input", () => {
  if (!transcriptBox.value.trim()) {
    hasDictatedText = false;
  }

  draftFromDictation = false;
  updatePostButton();
});

postDraft.addEventListener("input", updatePostButton);
channelSelect.addEventListener("change", updatePostButton);

postNowButton.addEventListener("click", async () => {
  if (postNowButton.disabled) return;

  const text = postDraft.value.trim();
  const channelId = channelSelect.value;
  const accountName =
    channelSelect.options[channelSelect.selectedIndex].text;

  if (!window.confirm(
    `Publish now to ${accountName}?\n\n${text}`
  )) {
    return;
  }

  postingInProgress = true;
  updatePostButton();
  publishStatus.textContent = "Sending to Buffer…";

  try {
    const response = await fetch("/api/buffer/post-now", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text, channelId })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Posting failed.");
    }

    draftFromDictation = false;
    publishStatus.textContent =
      "Buffer accepted your post for immediate publishing. Check Buffer or your social profile to confirm delivery.";
  } catch (error) {
    publishStatus.textContent =
      `${error.message} Check Buffer before sending again.`;
  } finally {
    postingInProgress = false;
    updatePostButton();
  }
});

// Place Copy post and Post now beside each other.
const postActions = document.createElement("div");
postActions.className = "buttons";

copyPostButton.before(postActions);
postActions.append(copyPostButton, postNowButton);

postActions.style.marginTop = "12px";
copyPostButton.style.marginTop = "0";
postNowButton.style.marginTop = "0";

updatePostButton();