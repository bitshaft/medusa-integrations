"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveApaczka = resolveApaczka;
exports.validateQuery = validateQuery;
exports.sendDocument = sendDocument;
const utils_1 = require("@medusajs/framework/utils");
const apaczka_1 = require("../modules/apaczka");
function resolveApaczka(req) {
    return req.scope.resolve(apaczka_1.APACZKA_MODULE);
}
/** Validates `req.query` and stores the parsed result on `req.validatedQuery`. */
function validateQuery(schema) {
    return (req, _res, next) => {
        const result = schema.safeParse(req.query);
        if (!result.success) {
            const message = result.error.issues
                .map((issue) => `${issue.path.join(".") || "query"}: ${issue.message}`)
                .join("; ");
            return next(new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, `Invalid request: ${message}`));
        }
        req.validatedQuery = result.data;
        next();
    };
}
/** Sends a base64 document from Apaczka as a file download. */
function sendDocument(res, input) {
    const buffer = Buffer.from(input.base64, "base64");
    res.setHeader("Content-Type", input.contentType);
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Content-Disposition", `${input.inline ? "inline" : "attachment"}; filename="${input.fileName.replace(/"/g, "")}"`);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.status(200).send(buffer);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvYXBpL3V0aWxzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBT0Esd0NBRUM7QUFHRCxzQ0FZQztBQUdELG9DQWFDO0FBdkNELHFEQUF1RDtBQUd2RCxnREFBbUQ7QUFHbkQsU0FBZ0IsY0FBYyxDQUFDLEdBQWtCO0lBQy9DLE9BQU8sR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQXVCLHdCQUFjLENBQUMsQ0FBQTtBQUNoRSxDQUFDO0FBRUQsa0ZBQWtGO0FBQ2xGLFNBQWdCLGFBQWEsQ0FBQyxNQUFpQjtJQUM3QyxPQUFPLENBQUMsR0FBa0IsRUFBRSxJQUFvQixFQUFFLElBQXdCLEVBQUUsRUFBRTtRQUM1RSxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQTtRQUMxQyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ3BCLE1BQU0sT0FBTyxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTTtpQkFDaEMsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLE9BQU8sS0FBSyxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7aUJBQ3RFLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQTtZQUNiLE9BQU8sSUFBSSxDQUFDLElBQUksbUJBQVcsQ0FBQyxtQkFBVyxDQUFDLEtBQUssQ0FBQyxZQUFZLEVBQUUsb0JBQW9CLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQTtRQUM3RixDQUFDO1FBQ0QsR0FBRyxDQUFDLGNBQWMsR0FBRyxNQUFNLENBQUMsSUFBK0IsQ0FBQTtRQUMzRCxJQUFJLEVBQUUsQ0FBQTtJQUNSLENBQUMsQ0FBQTtBQUNILENBQUM7QUFFRCwrREFBK0Q7QUFDL0QsU0FBZ0IsWUFBWSxDQUMxQixHQUFtQixFQUNuQixLQUFrRjtJQUVsRixNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsUUFBUSxDQUFDLENBQUE7SUFDbEQsR0FBRyxDQUFDLFNBQVMsQ0FBQyxjQUFjLEVBQUUsS0FBSyxDQUFDLFdBQVcsQ0FBQyxDQUFBO0lBQ2hELEdBQUcsQ0FBQyxTQUFTLENBQUMsZ0JBQWdCLEVBQUUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFBO0lBQzlDLEdBQUcsQ0FBQyxTQUFTLENBQ1gscUJBQXFCLEVBQ3JCLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxZQUFZLGVBQWUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQzVGLENBQUE7SUFDRCxHQUFHLENBQUMsU0FBUyxDQUFDLGVBQWUsRUFBRSxzQkFBc0IsQ0FBQyxDQUFBO0lBQ3RELEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFBO0FBQzlCLENBQUMifQ==