local startup_setup, startup = pcall(require, "startup")
if not startup_setup then
	print("Error loading startup.lua: " .. startup)
	return
end

startup.setup()
