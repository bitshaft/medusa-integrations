"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PACKAGE_NAME = void 0;
exports.packageVersion = packageVersion;
exports.userAgent = userAgent;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
exports.PACKAGE_NAME = "@bitshaft/medusa-plugin-apaczka";
let cached;
/** The installed package version, read once from package.json. */
function packageVersion() {
    if (cached) {
        return cached;
    }
    // Source: src/lib → ../../ ; build: .medusa/server/src/lib → ../../../../
    for (const relative of ["../../package.json", "../../../../package.json"]) {
        try {
            const pkg = JSON.parse((0, node_fs_1.readFileSync)((0, node_path_1.join)(__dirname, relative), "utf8"));
            if (pkg.name === exports.PACKAGE_NAME) {
                cached = String(pkg.version);
                return cached;
            }
        }
        catch {
            // try the next location
        }
    }
    cached = "0.0.0";
    return cached;
}
/** `User-Agent` sent to Apaczka, as their best practices ask. */
function userAgent() {
    return `medusa-plugin-apaczka/${packageVersion()} (+https://bitshaft.pl) Node/${process.versions.node}`;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmVyc2lvbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9saWIvdmVyc2lvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFRQSx3Q0FrQkM7QUFHRCw4QkFFQztBQS9CRCxxQ0FBc0M7QUFDdEMseUNBQWdDO0FBRW5CLFFBQUEsWUFBWSxHQUFHLGlDQUFpQyxDQUFBO0FBRTdELElBQUksTUFBMEIsQ0FBQTtBQUU5QixrRUFBa0U7QUFDbEUsU0FBZ0IsY0FBYztJQUM1QixJQUFJLE1BQU0sRUFBRSxDQUFDO1FBQ1gsT0FBTyxNQUFNLENBQUE7SUFDZixDQUFDO0lBQ0QsMEVBQTBFO0lBQzFFLEtBQUssTUFBTSxRQUFRLElBQUksQ0FBQyxvQkFBb0IsRUFBRSwwQkFBMEIsQ0FBQyxFQUFFLENBQUM7UUFDMUUsSUFBSSxDQUFDO1lBQ0gsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFBLHNCQUFZLEVBQUMsSUFBQSxnQkFBSSxFQUFDLFNBQVMsRUFBRSxRQUFRLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFBO1lBQ3ZFLElBQUksR0FBRyxDQUFDLElBQUksS0FBSyxvQkFBWSxFQUFFLENBQUM7Z0JBQzlCLE1BQU0sR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFBO2dCQUM1QixPQUFPLE1BQU0sQ0FBQTtZQUNmLENBQUM7UUFDSCxDQUFDO1FBQUMsTUFBTSxDQUFDO1lBQ1Asd0JBQXdCO1FBQzFCLENBQUM7SUFDSCxDQUFDO0lBQ0QsTUFBTSxHQUFHLE9BQU8sQ0FBQTtJQUNoQixPQUFPLE1BQU0sQ0FBQTtBQUNmLENBQUM7QUFFRCxpRUFBaUU7QUFDakUsU0FBZ0IsU0FBUztJQUN2QixPQUFPLHlCQUF5QixjQUFjLEVBQUUsZ0NBQWdDLE9BQU8sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUE7QUFDekcsQ0FBQyJ9