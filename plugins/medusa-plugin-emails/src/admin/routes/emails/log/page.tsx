import { Navigate } from "react-router-dom"

/** The send log moved to the "History" tab of the Emails page; old links land there. */
const EmailsLogPage = () => <Navigate to="/emails" replace />

export default EmailsLogPage
