import type { Copy } from "./types"

/** Default Polish copy. `{{variables}}` are replaced when the text is used. */
export const pl: Copy = {
  consent:
    "Wyślemy Ci e-mail, gdy ten produkt wróci do sprzedaży, za każdym razem gdy wróci, dopóki go nie kupisz albo się nie wypiszesz. " +
    "Twój adres posłuży tylko do tych powiadomień i nigdy do marketingu.",
  restock: {
    subject: "{{product_label}} jest znowu dostępny",
    preview: "Produkt, o który pytałeś(-aś), jest znowu w sprzedaży.",
    heading: "Znowu dostępny",
    body: "Dobra wiadomość: {{product_label}} jest znowu dostępny w {{store_name}}. Zapasy mogą szybko się skończyć, więc nie zwlekaj.",
    button: "Zobacz produkt",
    footnote:
      "Otrzymujesz tę wiadomość, bo poprosiłeś(-aś) o powiadomienie, gdy ten produkt wróci do sprzedaży. " +
      "Damy znać za każdym razem, gdy wróci, dopóki go nie kupisz albo się nie wypiszesz.",
  },
  confirm: {
    subject: "Potwierdź powiadomienie o dostępności",
    preview: "Jedno kliknięcie i damy znać, gdy produkt wróci.",
    heading: "Potwierdź powiadomienie",
    body: "Poprosiłeś(-aś) o powiadomienie, gdy {{product_label}} wróci do sprzedaży w {{store_name}}. Potwierdź przyciskiem poniżej.",
    button: "Potwierdź",
    footnote: "Jeśli to nie Ty, zignoruj tę wiadomość, a nic nie zostanie wysłane.",
  },
  footer: {
    unsubscribe: "Wypisz się",
    reason: "Wiadomość od {{store_name}}.",
  },
  pages: {
    confirmTitle: "Potwierdź powiadomienie o dostępności",
    confirmText: "Potwierdź, że chcesz dostać e-mail, gdy {{product_label}} wróci do sprzedaży.",
    confirmButton: "Potwierdź",
    confirmedTitle: "Powiadomienie potwierdzone",
    confirmedText: "Wyślemy Ci e-mail, gdy {{product_label}} wróci do sprzedaży.",
    unsubscribeTitle: "Wypisz się z powiadomień o dostępności",
    unsubscribeText: "Zatrzymać wiadomości o produkcie {{product_label}}?",
    unsubscribeButton: "Wypisz się",
    unsubscribedTitle: "Wypisano",
    unsubscribedText: "Nie dostaniesz już wiadomości o produkcie {{product_label}}.",
    invalidTitle: "Ten link jest już nieważny",
    invalidText: "Mógł zostać już użyty albo powiadomienie się zakończyło.",
  },
}
