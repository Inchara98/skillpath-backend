import { useExclusiveMenu } from '../lib/OpenMenuContext'
import { ChevronDownIcon } from './icons'

export interface DropdownOption {
  label: string
  dot?: string
}

export function Dropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: DropdownOption[]
  onChange: (value: string) => void
}) {
  const { ref, isOpen, toggle, close } = useExclusiveMenu<HTMLLabelElement>()

  return (
    <label ref={ref} className="relative flex items-center gap-2 text-sm text-gray-500">
      {label}
      <button
        type="button"
        onClick={toggle}
        className={`flex items-center gap-2 rounded-full border bg-white pl-4 pr-3 py-2 text-sm font-medium text-gray-900 ${
          isOpen ? 'border-violet-500 ring-1 ring-violet-500' : 'border-gray-300'
        }`}
      >
        {value}
        <ChevronDownIcon className="h-4 w-4 text-gray-400" />
      </button>

      {isOpen && (
        <ul className="absolute left-0 top-full z-50 mt-1 w-56 rounded-xl bg-white py-1.5 shadow-lg ring-1 ring-black/5">
          {options.map((option) => (
            <li key={option.label}>
              <button
                type="button"
                onClick={() => {
                  onChange(option.label)
                  close()
                }}
                className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-gray-50 ${
                  option.label === value ? 'text-violet-600 font-semibold' : 'text-gray-900'
                }`}
              >
                {option.dot && <span className={`h-2 w-2 rounded-full ${option.dot}`} />}
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </label>
  )
}
