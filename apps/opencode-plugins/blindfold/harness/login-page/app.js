// React 18 controlled form. State lives in React; `window.__spikeState()` reports only lengths and whether React state
// equals the DOM value, never a value.
const { createElement: h, useState } = React

function App() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [show, setShow] = useState(false)
  const [workspace, setWorkspace] = useState("")
  const [code, setCode] = useState("")
  const [sent, setSent] = useState("")

  window.__spikeState = () => {
    const dom = (id) => document.getElementById(id).value
    return {
      lengths: { email: email.length, password: password.length, workspace: workspace.length, code: code.length },
      synced: {
        email: dom("identifierId") === email,
        password: dom("password") === password,
        workspace: dom("workspace") === workspace,
        code: dom("totp") === code,
      },
      sent,
    }
  }

  async function submit(event) {
    event.preventDefault()
    // A careless page: logs the address and posts everything. The spike checks what reaches the model from these.
    console.log("login attempt for", email)
    const response = await fetch("/submit", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ email, password, workspace, code }).toString() })
    setSent(response.ok ? "sent" : "failed")
  }

  return h("form", { onSubmit: submit },
    // Google's identifier field: an email input with role=combobox.
    h("label", { htmlFor: "identifierId" }, "Email or phone"),
    h("div", { role: "presentation" },
      h("input", { id: "identifierId", type: "email", role: "combobox", "aria-autocomplete": "list", "aria-expanded": "false", "aria-label": "Email or phone", autoComplete: "username", value: email, onChange: (e) => setEmail(e.target.value) })),
    h("label", { htmlFor: "password" }, "Enter your password"),
    h("input", { id: "password", name: "Passwd", type: show ? "text" : "password", autoComplete: "current-password", value: password, onChange: (e) => setPassword(e.target.value) }),
    h("label", null, h("input", { type: "checkbox", checked: show, onChange: (e) => setShow(e.target.checked), style: { width: "auto" } }), " Show password"),
    h("label", { htmlFor: "workspace" }, "Workspace (plain text input)"),
    h("input", { id: "workspace", type: "text", value: workspace, onChange: (e) => setWorkspace(e.target.value) }),
    h("label", { htmlFor: "totp" }, "Enter code"),
    h("input", { id: "totp", inputMode: "numeric", autoComplete: "one-time-code", maxLength: 6, value: code, onChange: (e) => setCode(e.target.value.replace(/\D/g, "")) }),
    h("p", { id: "echo" }, email ? `Signing in as ${email}` : "Not signed in"),
    h("button", { type: "submit" }, "Next"),
    h("p", { id: "state" }, sent))
}

ReactDOM.createRoot(document.getElementById("root")).render(h(App))
