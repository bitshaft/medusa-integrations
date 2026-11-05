"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toPublicPoint = toPublicPoint;
function toPublicPoint(point) {
    const lat = Number(point.address?.latitude);
    const lng = Number(point.address?.longitude);
    return {
        id: point.foreign_address_id,
        type: point.type,
        subtype: point.subtype,
        name: point.name,
        address: {
            line1: point.address?.line1 ?? "",
            ...(point.address?.line2 ? { line2: point.address.line2 } : {}),
            postal_code: point.address?.postal_code ?? "",
            city: point.address?.city ?? "",
            country_code: point.address?.country_code ?? "",
        },
        latitude: Number.isFinite(lat) ? lat : null,
        longitude: Number.isFinite(lng) ? lng : null,
        open_hours: typeof point.open_hours === "string" ? point.open_hours : null,
        description: point.additional_info || null,
        image_url: point.image_url || null,
        cod: point.option_cod !== false,
        sending: point.option_send !== false,
        delivery: point.option_deliver !== false,
        distance_km: point.distance_km ?? null,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicG9pbnRzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL2xpYi9wb2ludHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUEwQkEsc0NBeUJDO0FBekJELFNBQWdCLGFBQWEsQ0FBQyxLQUF3QjtJQUNwRCxNQUFNLEdBQUcsR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxRQUFRLENBQUMsQ0FBQTtJQUMzQyxNQUFNLEdBQUcsR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxTQUFTLENBQUMsQ0FBQTtJQUM1QyxPQUFPO1FBQ0wsRUFBRSxFQUFFLEtBQUssQ0FBQyxrQkFBa0I7UUFDNUIsSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJO1FBQ2hCLE9BQU8sRUFBRSxLQUFLLENBQUMsT0FBTztRQUN0QixJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUk7UUFDaEIsT0FBTyxFQUFFO1lBQ1AsS0FBSyxFQUFFLEtBQUssQ0FBQyxPQUFPLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDakMsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDL0QsV0FBVyxFQUFFLEtBQUssQ0FBQyxPQUFPLEVBQUUsV0FBVyxJQUFJLEVBQUU7WUFDN0MsSUFBSSxFQUFFLEtBQUssQ0FBQyxPQUFPLEVBQUUsSUFBSSxJQUFJLEVBQUU7WUFDL0IsWUFBWSxFQUFFLEtBQUssQ0FBQyxPQUFPLEVBQUUsWUFBWSxJQUFJLEVBQUU7U0FDaEQ7UUFDRCxRQUFRLEVBQUUsTUFBTSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJO1FBQzNDLFNBQVMsRUFBRSxNQUFNLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUk7UUFDNUMsVUFBVSxFQUFFLE9BQU8sS0FBSyxDQUFDLFVBQVUsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLElBQUk7UUFDMUUsV0FBVyxFQUFFLEtBQUssQ0FBQyxlQUFlLElBQUksSUFBSTtRQUMxQyxTQUFTLEVBQUUsS0FBSyxDQUFDLFNBQVMsSUFBSSxJQUFJO1FBQ2xDLEdBQUcsRUFBRSxLQUFLLENBQUMsVUFBVSxLQUFLLEtBQUs7UUFDL0IsT0FBTyxFQUFFLEtBQUssQ0FBQyxXQUFXLEtBQUssS0FBSztRQUNwQyxRQUFRLEVBQUUsS0FBSyxDQUFDLGNBQWMsS0FBSyxLQUFLO1FBQ3hDLFdBQVcsRUFBRSxLQUFLLENBQUMsV0FBVyxJQUFJLElBQUk7S0FDdkMsQ0FBQTtBQUNILENBQUMifQ==