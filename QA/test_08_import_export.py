import time
from selenium.webdriver.common.by import By
import os
from baseclass import TestBaseClass
import pytest
from selenium.webdriver.support.wait import WebDriverWait
from selenium.webdriver.support import expected_conditions


@pytest.mark.usefixtures("tempDir_setup")
class Test_ImportExport(TestBaseClass):

    def test_importExport(self):
        driver = self.driver
        tempDir = self.tempDir
        targetHost = os.environ.get('TARGET_HOST')
        server_name = os.environ.get('SERVER_NAME')
        wait = WebDriverWait(driver, 15)

        def wait_for_element(by, selector):
            element = wait.until(expected_conditions.presence_of_element_located((by, selector)))
            return element

        wait_for_element(By.XPATH, "//a[@href='#/servers']").click()
        wait_for_element(By.ID, "profile_id").click()
        time.sleep(2)
        wait_for_element(By.XPATH, "//li[contains(.,'qa_test')]").click()
        time.sleep(2)

        wait_for_element(By.XPATH, "//button[@aria-label='Export']").click()
        time.sleep(4)
        
        filename = "servers.json"
        assert filename in os.listdir(tempDir)
        #print(os.listdir(testDir))


        # removing the server created to avoid duplication
        wait_for_element(By.XPATH, "//a[@href='#/servers']").click()
        time.sleep(2)
        wait_for_element(By.ID, "profile_id").click()
        time.sleep(2)
        wait_for_element(By.XPATH, "//li[contains(.,'qa_test')]").click()
        time.sleep(2)
        server_row = wait_for_element(By.XPATH, f"//tr[td/span[contains(text(), '{server_name}')]]")
        checkbox = server_row.find_element(By.XPATH, ".//input[@type='checkbox']")
        checkbox.click()
        wait_for_element(By.CSS_SELECTOR, "button[aria-label='Delete']").click()
        time.sleep(2)
        sync_button = wait_for_element(By.XPATH, "//button[@aria-label='Sync API Storage']")
        sync_button.click()
        
            # Testing the import function
        time.sleep(2)
        wait_for_element(By.XPATH, "//a[@href='#/servers']").click()
        wait_for_element(By.XPATH, "//input[@type='file']").send_keys(str(tempDir) +  "/servers.json")
        time.sleep(4)
        
        # verifying Imported file
        driver.get(targetHost+"/#/servers") 
        wait_for_element(By.ID, "profile_id").click()
        time.sleep(2)
        wait_for_element(By.XPATH, "//li[contains(.,'qa_test')]").click()
        time.sleep(2)
        assert server_name in driver.page_source
        
         # removing the server imported to avoid duplication
        wait_for_element(By.XPATH, "//a[@href='#/servers']").click()
        time.sleep(2)
        wait_for_element(By.ID, "profile_id").click()
        time.sleep(2)
        wait_for_element(By.XPATH, "//li[contains(.,'qa_test')]").click()
        time.sleep(2)
        server_row = wait_for_element(By.XPATH, f"//tr[td/span[contains(text(), '{server_name}')]]")
        checkbox = server_row.find_element(By.XPATH, ".//input[@type='checkbox']")
        checkbox.click()
        wait_for_element(By.CSS_SELECTOR, "button[aria-label='Delete']").click()
        time.sleep(2)
        sync_button = wait_for_element(By.XPATH, "//button[@aria-label='Sync API Storage']")
        sync_button.click()

        